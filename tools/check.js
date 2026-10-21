import fs from 'node:fs';
import path from 'node:path';
import { loadPackage, parseJSON, validate } from '../src/index.js';

const manifest = JSON.parse(fs.readFileSync('conformance/manifest.json', 'utf8'));
let failures = 0;
for (const fixture of manifest.cases) {
  // Invalid authored documents are evaluated in memory, including documents the
  // file loader correctly rejects before it can return a loaded package.
  const file = path.resolve('conformance', fixture.file);
  const input = fixture.valid ? loadPackage(file) : parseJSON(fs.readFileSync(file, 'utf8'), file);
  const result = validate(input);
  if (result.valid !== fixture.valid || (fixture.error && result.errors[0]?.code !== fixture.error)) {
    failures++; console.error(`${fixture.file}: ${JSON.stringify(result)}`);
  }
}
console.log(`${manifest.cases.length - failures}/${manifest.cases.length} conformance fixtures passed.`);
process.exitCode = failures ? 1 : 0;
