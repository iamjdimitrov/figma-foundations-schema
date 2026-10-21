import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { validate, resolve, loadPackage, digest } from '../src/index.js';

// Hand-authored against the specification, independent of the catalog generator.
const small = () => ({
  format: 'figma-foundations', formatVersion: '0.1.0',
  package: { id: 'review', name: 'Review', version: '1.0.0' },
  dependencies: {}, organization: [], sources: {},
  resources: {
    modes: { kind: 'collection', name: 'Modes', defaultMode: 'day', modes: { day: { name: 'Day' }, night: { name: 'Night' } } },
    alpha: { kind: 'variable', name: 'Alpha', dataType: 'number', collection: { resource: 'modes' }, values: { day: { literal: 0.2 }, night: { literal: 0.8 } } },
    surface: { kind: 'value', name: 'Surface', dataType: 'color', expression: { record: {
      space: { literal: 'srgb' }, channels: { literal: [0, 0, 0] }, alpha: { ref: { resource: 'alpha' } },
    } } },
  },
});

test('independently authored package resolves every mode without a generated fixture', () => {
  const doc = small();
  assert.equal(validate(doc).contextCount, 2);
  assert.equal(resolve(doc).resources.surface.value.alpha, 0.2);
  assert.equal(resolve(doc, { modes: [{ collection: { resource: 'modes' }, mode: 'night' }] }).resources.surface.value.alpha, 0.8);
});

test('null and malformed root inputs produce structured errors', () => {
  for (const doc of [null, false, 1, 'text', [], {}]) {
    assert.equal(validate(doc).valid, false);
    assert.equal(validate(doc).errors[0].code, 'STRUCTURE_INVALID');
  }
});

test('invalid validation budgets cannot bypass complete context validation', () => {
  for (const maxContexts of [NaN, Infinity, -1, 0, 0.5, '4096', Number.MAX_SAFE_INTEGER + 1]) assert.equal(validate(small(), { maxContexts }).errors[0].code, 'ARGUMENT_INVALID');
  assert.equal(validate(small(), { maxContexts: 2 }).valid, true);
});

test('invalid caller contexts and unknown themes fail explicitly', () => {
  for (const options of [null, [], { themes: [null] }, { modes: [{ mode: 'day' }] }, { typo: true }]) assert.equal(validate(small(), options).errors[0].code, 'ARGUMENT_INVALID');
  assert.equal(validate(small(), { themes: ['missing'] }).errors[0].code, 'REFERENCE_MISSING');
});

test('direct native aliases cannot substitute timing and ordinary numeric variables', () => {
  const doc = small();
  doc.resources.time = { kind: 'variable', name: 'Time', dataType: 'timing', collection: { resource: 'modes' }, values: { day: { ref: { resource: 'alpha' } }, night: { literal: 0.2 } } };
  assert.equal(validate(doc).errors[0].code, 'TYPE_MISMATCH');
});

test('a pointer to an unbound field ignores bindings discarded by the selection', () => {
  const doc = small();
  doc.resources.color = { kind: 'variable', name: 'Color', dataType: 'color', collection: { resource: 'modes' }, values: { day: { ref: { resource: 'surface' } }, night: { ref: { resource: 'surface' } } } };
  doc.resources.paint = { kind: 'style', name: 'Paint', family: 'paint', expression: { list: [{ record: {
    itemId: { literal: 'base' }, type: { literal: 'SOLID' }, color: { bind: { variable: 'color' } }, opacity: { literal: 0.6 },
  } }] } };
  doc.resources.opacity = { kind: 'value', name: 'Opacity', dataType: 'number', expression: { ref: { resource: 'paint', pointer: '/0/opacity', modes: [{ collection: { resource: 'modes' }, mode: 'night' }] } } };
  assert.equal(resolve(doc).resources.opacity.value, 0.6);
});

test('embedded base64 padding bits must be canonical', () => {
  const doc = small();
  doc.resources.asset = { kind: 'asset', name: 'Asset', mediaType: 'image/png', content: { kind: 'embedded', base64: 'YR==', sha256: digest('a'), byteLength: 1 } };
  assert.equal(validate(doc).errors[0].code, 'ASSET_INVALID');
});

test('sparse arrays cannot hide holes behind unrelated named properties', () => {
  const doc = small(), array = new Array(1); array.extra = 1;
  doc.resources.surface.extensions = { 'example.org/data': array };
  assert.equal(validate(doc).errors[0].code, 'JSON_INVALID');
});

test('file loader validates the envelope before traversing resource paths', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ffs-review-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const doc of [null, false, {}, { format: 'figma-foundations-manifest', resources: ['/outside'] }]) {
    const file = path.join(directory, 'bad.json'); fs.writeFileSync(file, JSON.stringify(doc));
    assert.throws(() => loadPackage(file), error => error.code === 'STRUCTURE_INVALID');
  }
  const badUtf8 = Buffer.concat([Buffer.from('{"value":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]);
  const file = path.join(directory, 'utf8.json'); fs.writeFileSync(file, badUtf8);
  assert.throws(() => loadPackage(file), error => error.code === 'JSON_INVALID');
});

test('CLI help, version and argument errors have predictable exit codes', () => {
  const run = (...args) => spawnSync(process.execPath, ['src/cli.js', ...args], { encoding: 'utf8' });
  assert.equal(run('--help').status, 0);
  assert.equal(run('--version').stdout.trim(), '0.1.0');
  assert.equal(run('validate', 'examples/surface.foundation.json', '--theme', 'theme-dark').status, 2);
  assert.equal(run('resolve', 'examples/surface.foundation.json', '--theme', '--output', 'out.json').status, 2);
  assert.equal(run('validate', 'examples/surface.foundation.json', '--max-contexts', '999999999999999999999').status, 2);
});
