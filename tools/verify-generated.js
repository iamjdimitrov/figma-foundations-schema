import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { digest } from '../src/io.js';

const paths = ['schemas/0.1.0', 'docs/fields.md', 'docs/figma-baseline.json', 'docs/THIRD_PARTY_NOTICES.txt', 'examples/catalog.foundation.json', 'conformance/manifest.json', 'conformance/invalid'];
function snapshot() {
  const result = new Map();
  function walk(file) {
    if (fs.statSync(file).isDirectory()) for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name));
    else result.set(file, digest(fs.readFileSync(file)));
  }
  for (const file of paths) walk(file);
  return result;
}
const before = snapshot();
for (const script of ['tools/build-schemas.js', 'tools/build-examples.js']) execFileSync(process.execPath, [script], { stdio: 'inherit' });
const after = snapshot();
const changed = [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file));
if (changed.length) {
  console.error(`Generated files were stale and have been regenerated:\n${changed.join('\n')}\nReview and commit these changes.`);
  process.exitCode = 1;
} else console.log(`Verified ${after.size} generated files reproduce exactly.`);
