import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { buildRelease } from '../tools/release.js';
import { digest, validate, resolve } from '../src/index.js';

test('README contains a complete, independently usable package', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  const json = /```json\n([\s\S]*?)\n```/.exec(readme)?.[1];
  assert.ok(json);
  const doc = JSON.parse(json);
  assert.equal(validate(doc).valid, true);
  assert.deepEqual(doc, JSON.parse(fs.readFileSync('examples/minimal.foundation.json', 'utf8')));
  assert.deepEqual(resolve(doc).resources['brand-blue'].value.channels, [0.1, 0.3, 0.9]);
});

function readTar(bytes) {
  const entries = new Map();
  let offset = 0;
  while (bytes.subarray(offset, offset + 512).some(Boolean)) {
    const header = bytes.subarray(offset, offset + 512);
    const text = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '');
    const prefix = text(345, 155), name = (prefix ? prefix + '/' : '') + text(0, 100);
    const size = Number.parseInt(text(124, 12), 8);
    const mode = Number.parseInt(text(100, 8), 8);
    const storedChecksum = Number.parseInt(text(148, 8), 8);
    const checked = Buffer.from(header); checked.fill(32, 148, 156);
    assert.equal(checked.reduce((sum, byte) => sum + byte, 0), storedChecksum);
    assert.equal(text(257, 6), 'ustar');
    assert.equal(Number.parseInt(text(136, 12), 8), 0);
    assert.equal(text(156, 1), '0');
    assert.ok(!entries.has(name));
    entries.set(name, { bytes: bytes.subarray(offset + 512, offset + 512 + size), mode });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

test('release archives are reproducible, complete, private-file-free and individually hashed', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ffs-distribution-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = buildRelease(path.join(directory, 'first'));
  const second = buildRelease(path.join(directory, 'second'));
  assert.equal(first.sha256, second.sha256);
  const entries = readTar(gunzipSync(fs.readFileSync(first.archive)));
  const pkg = JSON.parse(fs.readFileSync('package.json'));
  const prefix = `${pkg.name}-${pkg.version}/`;
  for (const name of entries.keys()) {
    assert.ok(name.startsWith(prefix));
    assert.ok(!name.includes('..'));
    assert.ok(!/(?:^|\/)(?:node_modules|logs|dist|\.git|\.DS_Store)(?:\/|$)/.test(name));
  }
  for (const name of ['LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'package-lock.json', 'src/index.js', 'schemas/0.1.0/package.schema.json', 'docs/THIRD_PARTY_NOTICES.txt', 'examples/minimal.foundation.json']) assert.ok(entries.has(prefix + name), name);
  assert.equal(entries.get(prefix + 'src/cli.js').mode, 0o755);
  const manifest = JSON.parse(entries.get(prefix + 'RELEASE_MANIFEST.json').bytes);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.files.length, entries.size - 1);
  for (const file of manifest.files) {
    const entry = entries.get(prefix + file.path);
    assert.equal(entry.bytes.length, file.byteLength);
    assert.equal(digest(entry.bytes), file.sha256);
  }
  const checksums = fs.readFileSync(path.join(directory, 'first', 'SHA256SUMS'), 'utf8');
  assert.ok(checksums.includes(first.sha256));
});
