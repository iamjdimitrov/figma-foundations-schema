import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fail, escapePointer } from './errors.js';
import { checkStructure, checkManifestStructure } from './schema.js';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function assertJSON(value, file = '<memory>', pointer = '', active = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || active.has(value) || (!Array.isArray(value) && ![null, Object.prototype].includes(Object.getPrototypeOf(value)))) fail('JSON_INVALID', 'Input must be finite, acyclic JSON data', { file, pointer });
  if (Object.getOwnPropertySymbols(value).length || (Array.isArray(value) && (Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, i) => !Object.hasOwn(value, i)).some(Boolean)))) fail('JSON_INVALID', 'Input must not contain symbols or sparse/custom array properties', { file, pointer });
  active.add(value);
  for (const [key, child] of Object.entries(value)) assertJSON(child, file, `${pointer}/${escapePointer(key)}`, active);
  active.delete(value);
}

// JSON.parse discards duplicate keys before a schema validator can see them.
export function parseJSON(text, file = '<memory>') {
  let index = 0;
  const error = message => fail('JSON_INVALID', `${message} at character ${index}`, { file });
  const space = () => { while (/[\x20\x09\x0a\x0d]/.test(text[index] ?? '') && index < text.length) index++; };
  function string() {
    const start = index++;
    while (index < text.length) {
      if (text[index] === '\\') { index += 2; continue; }
      if (text[index++] === '"') {
        try { return JSON.parse(text.slice(start, index)); } catch { error('Invalid string'); }
      }
    }
    error('Unterminated string');
  }
  function value(pointer = '') {
    space();
    if (text[index] === '"') return string();
    if (text[index] === '{') {
      index++; space();
      const entries = [], keys = new Set();
      if (text[index] === '}') { index++; return {}; }
      while (index < text.length) {
        space();
        if (text[index] !== '"') error('Expected object key');
        const key = string();
        if (keys.has(key)) fail('JSON_DUPLICATE_KEY', `Duplicate key ${JSON.stringify(key)}`, { file, pointer: `${pointer}/${escapePointer(key)}` });
        keys.add(key); space();
        if (text[index++] !== ':') error('Expected colon');
        entries.push([key, value(`${pointer}/${escapePointer(key)}`)]); space();
        if (text[index] === '}') { index++; return Object.fromEntries(entries); }
        if (text[index++] !== ',') error('Expected comma');
      }
      error('Unterminated object');
    }
    if (text[index] === '[') {
      index++; space();
      const array = [];
      if (text[index] === ']') { index++; return array; }
      while (index < text.length) {
        array.push(value(`${pointer}/${array.length}`)); space();
        if (text[index] === ']') { index++; return array; }
        if (text[index++] !== ',') error('Expected comma');
      }
      error('Unterminated array');
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(index));
    if (!match) error('Expected JSON value');
    index += match[0].length;
    const result = JSON.parse(match[0]);
    if (typeof result === 'number' && !Number.isFinite(result)) error('Nonfinite number');
    return result;
  }
  const result = value(); space();
  if (index !== text.length) error('Unexpected trailing input');
  return result;
}

export function safeFile(baseDirectory, relative) {
  if (!baseDirectory) fail('FILE_CONTEXT_MISSING', 'File content requires a package directory');
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => p === '..' || p === '.' || !p)) fail('PATH_INVALID', `Expected a contained package-relative path: ${relative}`);
  const base = fs.realpathSync(baseDirectory);
  const target = path.resolve(base, relative);
  let real;
  try { real = fs.realpathSync(target); } catch { fail('FILE_MISSING', `Missing package file: ${relative}`, { file: target }); }
  if (!real.startsWith(base + path.sep)) fail('PATH_INVALID', `Path leaves the package: ${relative}`);
  if (!fs.statSync(real).isFile()) fail('FILE_INVALID', `Expected a regular file: ${relative}`, { file: real });
  return real;
}

function decode(bytes, file) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('JSON_INVALID', 'JSON files must contain valid UTF-8', { file }); }
}

export function loadPackage(filename) {
  if (typeof filename !== 'string' || !filename) fail('ARGUMENT_INVALID', 'Expected a package filename');
  const loaded = new Map(), active = new Set();
  function load(file) {
    file = fs.realpathSync(file);
    if (active.has(file)) fail('DEPENDENCY_CYCLE', 'Dependency files form a cycle', { file });
    if (loaded.has(file)) return loaded.get(file);
    active.add(file);
    const bytes = fs.readFileSync(file);
    let document = parseJSON(decode(bytes, file), file);
    if (document && document.format === 'figma-foundations-manifest') checkManifestStructure({ document, file });
    else checkStructure({ document, file });
    const wasManifest = document.format === 'figma-foundations-manifest';
    const directory = path.dirname(file), locations = new Map();
    if (document.format === 'figma-foundations-manifest') {
      if (!Array.isArray(document.resources) || !document.resources.length || new Set(document.resources).size !== document.resources.length) fail('MANIFEST_INVALID', 'Manifest requires unique resource-file paths', { file });
      const entries = [];
      const seen = new Set();
      for (const relative of document.resources) {
        if (typeof relative !== 'string') fail('MANIFEST_INVALID', 'Resource paths must be strings', { file });
        const resourceFile = safeFile(directory, relative);
        const fragment = parseJSON(decode(fs.readFileSync(resourceFile), resourceFile), resourceFile);
        if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) fail('MANIFEST_INVALID', 'Resource file must contain a resource dictionary', { file: resourceFile });
        for (const [id, resource] of Object.entries(fragment)) {
          if (seen.has(id)) fail('RESOURCE_DUPLICATE', `Resource ${id} occurs in multiple files`, { file: resourceFile, resource: id });
          seen.add(id); entries.push([id, resource]); locations.set(id, resourceFile);
        }
      }
      document = { ...document, format: 'figma-foundations', resources: Object.fromEntries(entries) };
    }
    const unit = { document, file, directory, sha256: digest(bytes), dependencies: new Map(), locations, wasManifest };
    loaded.set(file, unit);
    for (const [alias, descriptor] of Object.entries(document.dependencies ?? {})) {
      if (!descriptor || typeof descriptor.path !== 'string') fail('DEPENDENCY_INVALID', `Dependency ${alias} has no file path`, { file });
      const dependency = load(safeFile(directory, descriptor.path));
      if (dependency.wasManifest) fail('DEPENDENCY_INVALID', 'Dependencies must be assembled packages, not authoring manifests', { file });
      if (dependency.sha256 !== descriptor.sha256) fail('DEPENDENCY_INTEGRITY', `Dependency digest differs: ${alias}`, { file });
      if (dependency.document.package?.id !== descriptor.id || dependency.document.package?.version !== descriptor.version) fail('DEPENDENCY_IDENTITY', `Dependency identity differs: ${alias}`, { file });
      unit.dependencies.set(alias, dependency);
    }
    active.delete(file);
    return unit;
  }
  return load(path.resolve(filename));
}
