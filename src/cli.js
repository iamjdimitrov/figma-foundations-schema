#!/usr/bin/env node
import fs from 'node:fs';
import { loadPackage, validate, resolve, FoundationsError } from './index.js';

const args = process.argv.slice(2);
const usage = 'Usage: ffs validate|resolve|assemble <package-or-manifest.json> [--theme <id>] [--max-contexts <count>] [--output <file>]';
if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); process.exit(0); }
if (args.length === 1 && args[0] === '--version') {
  console.log(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  process.exit(0);
}
const command = args.shift(), file = args.shift();
if (!['validate', 'resolve', 'assemble'].includes(command) || !file) {
  console.error(usage);
  process.exit(2);
}
try {
  const options = { themes: [] }; let output;
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!value || value.startsWith('--')) throw new FoundationsError('ARGUMENT_INVALID', `Missing value for ${flag}`);
    if (flag === '--theme') options.themes.push(value);
    else if (flag === '--max-contexts' && /^[1-9][0-9]*$/.test(value)) options.maxContexts = Number(value);
    else if (flag === '--output') output = value;
    else throw new FoundationsError('ARGUMENT_INVALID', `Unknown argument ${flag}`);
  }
  if (command !== 'resolve' && options.themes.length) throw new FoundationsError('ARGUMENT_INVALID', '--theme is only supported by resolve');
  const unit = loadPackage(file);
  let result = validate(unit, options);
  if (!result.valid) { console.error(JSON.stringify(result, null, 2)); process.exitCode = result.errors[0]?.code === 'ARGUMENT_INVALID' ? 2 : 1; }
  else {
    if (command === 'resolve') result = resolve(unit, options);
    if (command === 'assemble') result = unit.document;
    const text = JSON.stringify(result, null, 2) + '\n';
    if (output) fs.writeFileSync(output, text, { flag: 'wx' });
    else process.stdout.write(text);
  }
} catch (error) {
  console.error(JSON.stringify({ valid: false, errors: [error instanceof FoundationsError ? error.toJSON() : { code: 'IO_ERROR', message: error.message }] }, null, 2));
  process.exitCode = error instanceof FoundationsError && error.code === 'ARGUMENT_INVALID' ? 2 : 1;
}
