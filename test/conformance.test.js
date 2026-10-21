import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validate, resolve, parseJSON, loadPackage, digest } from '../src/index.js';
import Ajv2020 from 'ajv/dist/2020.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const base = () => read('examples/surface.foundation.json');
const catalog = () => read('examples/catalog.foundation.json');
const literal = value => ({ literal: value });
const fixtureManifest = read('conformance/manifest.json');
for (const fixture of fixtureManifest.cases) test(`fixture: ${fixture.file}`, () => {
  const doc = read(`conformance/${fixture.file}`);
  const result = validate(doc);
  assert.equal(result.valid, fixture.valid, JSON.stringify(result));
  if (fixture.error) assert.equal(result.errors[0].code, fixture.error, JSON.stringify(result));
});

test('light and dark resolve while preserving the same variable binding', () => {
  const light = resolve(base(), { themes: ['theme-light'] });
  const dark = resolve(base(), { themes: ['theme-dark'] });
  assert.deepEqual(light.resources['canvas-style'].value[0].color.channels, [1, 1, 1]);
  assert.deepEqual(dark.resources['canvas-style'].value[0].color.channels, [0.06, 0.06, 0.08]);
  assert.deepEqual(light.resources['canvas-style'].bindings, dark.resources['canvas-style'].bindings);
  assert.equal(dark.resources['canvas-style'].bindings[0].pointer, '/0/color');
});

test('renaming and regrouping preserve values and bindings', () => {
  const doc = base(), before = resolve(doc).resources;
  for (const resource of Object.values(doc.resources)) {
    resource.name = 'A duplicate label';
    for (const mode of Object.values(resource.modes ?? {})) mode.name = 'Also duplicated';
  }
  doc.organization = [];
  assert.deepEqual(resolve(doc).resources, before);
});

test('extended collections override selected modes and inherit other values', () => {
  const doc = catalog();
  assert.deepEqual(resolve(doc, { themes: ['theme-brand'] }).resources['surface-color'].value.channels, [0.8, 0.2, 0.4]);
  const night = resolve(doc, { modes: [{ collection: { resource: 'brand' }, mode: 'brand-night' }] });
  assert.deepEqual(night.resources['surface-color'].value.channels, [0.06, 0.06, 0.08]);
  assert.deepEqual(resolve(doc).resources['surface-color'].value.channels, [1, 1, 1]);
});

test('parent and child mode selections in one theme are ambiguous', () => {
  const doc = catalog();
  doc.resources['theme-brand'].selections.push({ collection: { resource: 'appearance' }, mode: 'day' });
  assert.equal(validate(doc).errors[0].code, 'MODE_CONFLICT');
});

test('a nested extension inherits the immediate parent override', () => {
  const doc = catalog();
  doc.resources.nested = { kind: 'collection', name: 'Nested brand', extends: { resource: 'brand' }, modes: { only: { name: 'Only' } }, defaultMode: 'only', modeMap: { only: 'brand-day' } };
  assert.deepEqual(resolve(doc, { modes: [{ collection: { resource: 'nested' }, mode: 'only' }] }).resources['surface-color'].value.channels, [0.8, 0.2, 0.4]);
});

test('cycles inside extended collection overrides fail', () => {
  const doc = catalog();
  doc.resources.brand.overrides[0].values['brand-day'] = { ref: { resource: 'surface-color' } };
  assert.equal(validate(doc).errors[0].code, 'CYCLE');
});

test('extended mode mappings must be total', () => {
  const doc = catalog(); delete doc.resources.brand.modeMap['brand-night'];
  assert.equal(validate(doc).errors[0].code, 'MODE_MAP_INVALID');
});

test('root collections reject override records', () => {
  const doc = base(); doc.resources.appearance.overrides = [];
  assert.equal(validate(doc).errors[0].code, 'COLLECTION_INVALID');
});

test('theme precedence is explicit and left-to-right', () => {
  const doc = base();
  assert.deepEqual(resolve(doc, { themes: ['theme-light', 'theme-dark'] }).resources['surface-color'].value.channels, [0.06, 0.06, 0.08]);
  assert.deepEqual(resolve(doc, { themes: ['theme-dark', 'theme-light'] }).resources['surface-color'].value.channels, [1, 1, 1]);
});

test('cross-collection aliases use the target collection mode, not a matching label', () => {
  const doc = base();
  doc.resources.second = { kind: 'collection', name: 'Second', modes: { a: { name: 'Dark' }, b: { name: 'Light' } }, defaultMode: 'a' };
  doc.resources.alias = { kind: 'variable', name: 'Alias', dataType: 'color', collection: { resource: 'second' }, values: { a: { ref: { resource: 'surface-color' } }, b: { ref: { resource: 'surface-color' } } } };
  assert.deepEqual(resolve(doc).resources.alias.value.channels, [1, 1, 1]);
  assert.deepEqual(resolve(doc, { themes: ['theme-dark'] }).resources.alias.value.channels, [0.06, 0.06, 0.08]);
});

test('reference-local context overrides stay inside their evaluation subtree', () => {
  const doc = base();
  doc.resources.pinned = { kind: 'value', name: 'Pinned', dataType: 'color', expression: { ref: { resource: 'surface-color', modes: [{ collection: { resource: 'appearance' }, mode: 'night' }] } } };
  const output = resolve(doc);
  assert.deepEqual(output.resources.pinned.value.channels, [0.06, 0.06, 0.08]);
  assert.deepEqual(output.resources['surface-color'].value.channels, [1, 1, 1]);
});

test('a pinned reference cannot misrepresent a live native binding', () => {
  const doc = base();
  doc.resources.pinned = { kind: 'style', name: 'Pinned style', family: 'paint', expression: { ref: { resource: 'canvas-style', modes: [{ collection: { resource: 'appearance' }, mode: 'night' }] } } };
  assert.equal(validate(doc).errors[0].code, 'BINDING_CONTEXT');
});

test('JSON Pointer decodes escapes, and refuses leading-zero array indexes', () => {
  const doc = base();
  doc.resources.channel = { kind: 'value', name: 'Channel', dataType: 'number', expression: { ref: { resource: 'color-white', pointer: '/channels/0' } } };
  assert.equal(resolve(doc).resources.channel.value, 1);
  doc.resources.channel.expression.ref.pointer = '/channels/00';
  assert.equal(validate(doc).errors[0].code, 'POINTER_MISSING');
});

test('all cross-collection combinations are validated, not just defaults', () => {
  const doc = base();
  doc.resources.numbers = { kind: 'collection', name: 'Numbers', modes: { a: { name: 'A' }, b: { name: 'B' } }, defaultMode: 'a' };
  doc.resources.alpha = { kind: 'variable', name: 'Alpha', dataType: 'number', collection: { resource: 'numbers' }, values: { a: literal(1), b: literal(2) } };
  doc.resources.invalid = { kind: 'value', name: 'Invalid composed color', dataType: 'color', expression: { record: { space: literal('srgb'), channels: literal([1, 1, 1]), alpha: { ref: { resource: 'alpha' } } } } };
  assert.equal(validate(doc).errors[0].code, 'TYPE_MISMATCH');
});

test('context budget fails explicitly and can be raised', () => {
  assert.equal(validate(base(), { maxContexts: 1 }).errors[0].code, 'CONTEXT_LIMIT');
  assert.equal(validate(base(), { maxContexts: 2 }).valid, true);
});

test('numeric variables bind to declared pixel fields without rewriting authored data', () => {
  const doc = catalog();
  doc.resources['text-detail'].expression = { record: { fontSize: { bind: { variable: 'var-size' } } } };
  const before = JSON.stringify(doc);
  const output = resolve(doc);
  assert.equal(output.resources['text-detail'].value.fontSize, 16);
  assert.equal(output.resources['text-detail'].bindings[0].pointer, '/fontSize');
  assert.equal(JSON.stringify(doc), before);
});

test('literal expression-like strings and objects are never evaluated', () => {
  const doc = base();
  doc.resources.text = { kind: 'value', name: 'Text', dataType: 'string', expression: literal('{color-white}') };
  assert.equal(resolve(doc).resources.text.value, '{color-white}');
});

test('mixed or malformed expressions fail structurally', () => {
  const doc = base(); doc.resources['color-white'].expression.ref = { resource: 'color-ink' };
  assert.equal(validate(doc).errors[0].code, 'STRUCTURE_INVALID');
});

test('duplicate JSON keys, nonfinite JSON and non-JSON whitespace are rejected', () => {
  assert.throws(() => parseJSON('{"x":1,"x":2}'), e => e.code === 'JSON_DUPLICATE_KEY');
  assert.throws(() => parseJSON('{"x":1e999}'), e => e.code === 'JSON_INVALID');
  assert.throws(() => parseJSON('\u00a0{}'), e => e.code === 'JSON_INVALID');
  assert.deepEqual(parseJSON('{"escaped":"a\\\"b", "array":[null,true,-2.5e2]}'), { escaped: 'a"b', array: [null, true, -250] });
});

test('embedded base64 must be valid and exactly match length and digest', () => {
  const doc = catalog(); doc.resources['pattern-asset'].content.base64 = 'YQ';
  assert.equal(validate(doc).errors[0].code, 'ASSET_INVALID');
});

test('gradient geometry, stop order and array item identities are validated', () => {
  const doc = catalog();
  doc.resources['paint-catalog'].expression.literal[1].gradientStops.reverse();
  assert.equal(validate(doc).errors[0].code, 'VALUE_INVALID');
  const badMatrix = catalog(); badMatrix.resources['paint-catalog'].expression.literal[1].gradientTransform = [[1, 0], [0, 1]];
  assert.equal(validate(badMatrix).errors[0].code, 'TYPE_MISMATCH');
});

test('native Text Styles reject text-node-only properties', () => {
  const doc = catalog(); doc.resources['text-body'].expression.literal.textAlignHorizontal = 'LEFT';
  assert.equal(validate(doc).errors[0].code, 'TYPE_MISMATCH');
});

test('typed shader assets cannot be replaced by image assets', () => {
  const doc = catalog(); doc.resources['paint-catalog'].expression.literal.find(p => p.type === 'SHADER').asset = { resource: 'image-asset' };
  assert.equal(validate(doc).errors[0].code, 'ASSET_TYPE');
});

test('unknown optional metadata survives resolution input untouched', () => {
  const doc = base(); doc.resources['color-white'].extensions = { 'example.org/editor': { any: ['metadata', 3] } };
  assert.equal(validate(doc).valid, true);
  assert.deepEqual(doc.resources['color-white'].extensions, { 'example.org/editor': { any: ['metadata', 3] } });
});

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ffs-conformance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function write(directory, name, value) {
  const file = path.join(directory, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  return file;
}
test('manifest assembly records locations and rejects duplicate resource IDs', t => {
  const directory = temporary(t), doc = base();
  const resources = doc.resources; doc.format = 'figma-foundations-manifest'; doc.resources = ['parts/one.json', 'parts/two.json'];
  const entries = Object.entries(resources);
  write(directory, 'parts/one.json', Object.fromEntries(entries.slice(0, 4)));
  write(directory, 'parts/two.json', Object.fromEntries(entries.slice(4)));
  const file = write(directory, 'manifest.json', doc);
  const assembled = loadPackage(file);
  assert.equal(validate(assembled).valid, true);
  assert.deepEqual(assembled.document.resources, resources);
  write(directory, 'parts/two.json', resources);
  assert.throws(() => loadPackage(file), e => e.code === 'RESOURCE_DUPLICATE');
});

test('dependency identity, exact bytes and dependency-local asset addresses are preserved', t => {
  const directory = temporary(t), child = catalog();
  const depFile = write(directory, 'library/library.json', child);
  const parent = base(); parent.package.id = 'consumer';
  parent.dependencies.library = { id: child.package.id, version: child.package.version, path: 'library/library.json', sha256: digest(fs.readFileSync(depFile)) };
  parent.resources.imported = { kind: 'style', name: 'Imported', family: 'paint', expression: { ref: { dependency: 'library', resource: 'paint-catalog' } } };
  const file = write(directory, 'package.json', parent);
  const loaded = loadPackage(file);
  const result = validate(loaded);
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(resolve(loaded).resources.imported.references.length, 5);
  fs.appendFileSync(depFile, ' ');
  assert.throws(() => loadPackage(file), e => e.code === 'DEPENDENCY_INTEGRITY');
});

test('asset file paths reject traversal and escaping symlinks', t => {
  const directory = temporary(t), doc = base();
  doc.resources.file = { kind: 'asset', name: 'File', mediaType: 'image/png', content: { kind: 'file', path: '../outside', sha256: digest('a'), byteLength: 1 } };
  const file = write(directory, 'package.json', doc);
  assert.equal(validate(loadPackage(file)).errors[0].code, 'PATH_INVALID');
  fs.symlinkSync(os.tmpdir(), path.join(directory, 'escape'));
  doc.resources.file.content.path = `escape/${path.basename(directory)}/package.json`;
  // The resolved destination is actually inside the package; use a truly external file.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ffs-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'asset'), 'a');
  doc.resources.file.content.path = `escape/${path.basename(outside)}/asset`;
  write(directory, 'package.json', doc);
  assert.equal(validate(loadPackage(file)).errors[0].code, 'PATH_INVALID');
});

test('file assets are verified against decoded bytes', t => {
  const directory = temporary(t), doc = base();
  write(directory, 'assets/a.svg', '<svg/>');
  doc.resources.file = { kind: 'asset', name: 'File', mediaType: 'image/svg+xml', content: { kind: 'file', path: 'assets/a.svg', sha256: digest('<svg/>'), byteLength: 6 } };
  const file = write(directory, 'package.json', doc);
  assert.equal(validate(loadPackage(file)).valid, true);
  write(directory, 'assets/a.svg', '<bad/>');
  assert.equal(validate(loadPackage(file)).errors[0].code, 'ASSET_INTEGRITY');
});

test('CLI returns machine-readable output and appropriate exit codes', () => {
  const good = spawnSync(process.execPath, ['src/cli.js', 'validate', 'examples/surface.foundation.json'], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).valid, true);
  const bad = spawnSync(process.execPath, ['src/cli.js', 'validate', 'conformance/invalid/missing-reference.json'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).errors[0].code, 'REFERENCE_MISSING');
});

test('every distributed schema is valid Draft 2020-12 and can be compiled independently', () => {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true });
  const files = ['package', 'values', 'manifest', 'resources'];
  for (const file of files) ajv.addSchema(read(`schemas/0.1.0/${file}.schema.json`));
  for (const file of files) assert.ok(ajv.getSchema(`urn:ffs:0.1.0:${file}`));
});

test('color composition preserves independent aliases and explicit alpha units', () => {
  const doc = catalog();
  assert.equal(resolve(doc).resources['color-with-opacity'].value.alpha, 0.5);
  doc.resources['var-opacity'].values.base = literal(25);
  assert.equal(resolve(doc).resources['color-with-opacity'].value.alpha, 0.25);
  doc.resources['color-white'].expression.literal.alpha = 0.5;
  assert.equal(resolve(doc).resources['color-with-opacity'].value.alpha, 0.125);
  doc.resources['color-with-opacity'].values.base.color.operation = 'replace';
  assert.equal(resolve(doc).resources['color-with-opacity'].value.alpha, 0.25);
});

test('color composition rejects out-of-range opacity and detects cycles', () => {
  const doc = catalog(); doc.resources['var-opacity'].values.base = literal(101);
  assert.equal(validate(doc).errors[0].code, 'VALUE_INVALID');
  const cycle = catalog(); cycle.resources['color-with-opacity'].values.base.color.base = { ref: { resource: 'color-with-opacity' } };
  assert.equal(validate(cycle).errors[0].code, 'CYCLE');
});

test('mode and variable ordering are explicit, total and duplicate-free', () => {
  const doc = base();
  doc.resources.appearance.modeOrder = ['night', 'day'];
  doc.resources.appearance.variableOrder = [{ resource: 'surface-color' }];
  assert.equal(validate(doc).valid, true);
  doc.resources.appearance.modeOrder = ['night'];
  assert.equal(validate(doc).errors[0].code, 'ORDER_INVALID');
  doc.resources.appearance.modeOrder = ['night', 'day'];
  doc.resources.appearance.variableOrder = [];
  assert.equal(validate(doc).errors[0].code, 'ORDER_INVALID');
});

test('alternate gradient source geometries are exclusive', () => {
  const doc = catalog();
  doc.resources['paint-catalog'].expression.literal[1].gradientHandlePositions = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  assert.equal(validate(doc).errors[0].code, 'TYPE_MISMATCH');
});

test('font-axis tags, image filters and custom easing limits are checked', () => {
  const font = catalog(); font.resources['text-body'].expression.literal.fontName.variationSettings.longtag = 1;
  assert.equal(validate(font).errors[0].code, 'TYPE_MISMATCH');
  const filter = catalog(); filter.resources['paint-catalog'].expression.literal.find(p => p.type === 'IMAGE').filters.exposure = 2;
  assert.equal(validate(filter).errors[0].code, 'TYPE_MISMATCH');
  const curve = catalog(); curve.resources['easing-bezier'].expression.literal.easingFunctionCubicBezier.x1 = 2;
  assert.equal(validate(curve).errors[0].code, 'TYPE_MISMATCH');
});

test('source publishing provenance is separate from resource identity', () => {
  const doc = base();
  doc.sources.example = { product: 'figma-design', apiSurface: 'manual' };
  doc.resources['color-white'].sourceLinks = [{ source: 'example', objectId: 'example-native-id', libraryKey: 'example-library-key', remote: true, publishStatus: 'CURRENT' }];
  assert.equal(validate(doc).valid, true);
});

test('non-JSON in-memory input is rejected without a native exception', () => {
  const doc = base(); doc.resources['color-white'].extensions = { 'example.org/data': { missing: undefined } };
  assert.equal(validate(doc).errors[0].code, 'JSON_INVALID');
  const cyclic = base(); cyclic.organization.push(cyclic);
  assert.equal(validate(cyclic).errors[0].code, 'JSON_INVALID');
});

test('dependency-local GIF addresses survive imported paints', t => {
  const directory = temporary(t), child = catalog();
  child.resources.gif = { kind: 'asset', name: 'Gif', mediaType: 'image/gif', content: { kind: 'external', provider: 'example', id: 'gif' } };
  child.resources['paint-catalog'].expression.literal.find(p => p.type === 'IMAGE').gifAsset = { resource: 'gif' };
  const dep = write(directory, 'library/library.json', child);
  const parent = base(); parent.package.id = 'consumer';
  parent.dependencies.lib = { id: child.package.id, version: child.package.version, path: 'library/library.json', sha256: digest(fs.readFileSync(dep)) };
  parent.resources.imported = { kind: 'style', name: 'Import', family: 'paint', expression: { ref: { dependency: 'lib', resource: 'paint-catalog' } } };
  const input = loadPackage(write(directory, 'package.json', parent));
  assert.equal(validate(input).valid, true);
  assert.ok(resolve(input).resources.imported.references.some(r => r.pointer.endsWith('/gifAsset')));
});

test('cross-package extension overrides resolve in their authoring namespace', t => {
  const directory = temporary(t), library = base();
  const dep = write(directory, 'library/library.json', library);
  const doc = base(); doc.package.id = 'consumer';
  doc.dependencies.lib = { id: library.package.id, version: library.package.version, path: 'library/library.json', sha256: digest(fs.readFileSync(dep)) };
  doc.resources.brand = { kind: 'collection', name: 'Brand', extends: { dependency: 'lib', resource: 'appearance' }, modes: { only: { name: 'Only' } }, defaultMode: 'only', modeMap: { only: 'day' }, overrides: [{ variable: { dependency: 'lib', resource: 'surface-color' }, values: { only: { ref: { resource: 'color-ink' } } } }] };
  doc.resources.imported = { kind: 'value', name: 'Import', dataType: 'color', expression: { ref: { dependency: 'lib', resource: 'surface-color' } } };
  const input = loadPackage(write(directory, 'package.json', doc));
  const output = resolve(input, { modes: [{ collection: { resource: 'brand' }, mode: 'only' }] });
  assert.deepEqual(output.resources.imported.value.channels, [0.06, 0.06, 0.08]);
});

test('bounded vector artwork validates topology indexes and asset dependency cycles', () => {
  const invalid = catalog(); invalid.resources.artwork.expression.literal.segments[0].end = 99;
  assert.equal(validate(invalid).errors[0].code, 'VALUE_INVALID');
  const doc = base();
  const artwork = { vertices: [], segments: [], regions: [{ windingRule: 'NONZERO', loops: [], fillStyle: { resource: 'pattern' } }] };
  const bytes = Buffer.from(JSON.stringify(artwork));
  doc.resources.art = { kind: 'asset', name: 'Art', mediaType: 'application/vnd.ffs.vector+json', content: { kind: 'embedded', base64: bytes.toString('base64'), byteLength: bytes.length, sha256: digest(bytes) } };
  doc.resources.pattern = { kind: 'style', name: 'Pattern', family: 'paint', expression: literal([{ itemId: 'pattern', type: 'PATTERN', asset: { resource: 'art' }, tileType: 'RECTANGULAR', scalingFactor: 1, spacing: { x: 0, y: 0 }, horizontalAlignment: 'CENTER' }]) };
  assert.equal(validate(doc).errors[0].code, 'CYCLE');
});

test('shader property metadata retains its own description field', () => {
  const doc = catalog();
  const shader = doc.resources['paint-catalog'].expression.literal.find(p => p.type === 'SHADER');
  shader.propertyMetadata.strength.description = 'User-authored shader parameter documentation';
  assert.equal(validate(doc).valid, true);
});
