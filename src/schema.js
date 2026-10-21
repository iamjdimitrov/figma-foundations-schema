import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { fail } from './errors.js';

const read = file => JSON.parse(fs.readFileSync(new URL(`../schemas/0.1.0/${file}.schema.json`, import.meta.url), 'utf8'));
export const valueSchema = read('values');
export const packageSchema = read('package');
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
ajv.addSchema(packageSchema);
ajv.addSchema(valueSchema);
export const typeNames = Object.keys(valueSchema.$defs).filter(k => k.startsWith('type-')).map(k => k.slice(5));
const validators = new Map(typeNames.map(name => [name, ajv.compile({ $ref: `urn:ffs:0.1.0:values#/$defs/type-${name}` })]));
const validatePackage = ajv.getSchema('urn:ffs:0.1.0:package');
const validateManifest = ajv.compile(read('manifest'));
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' };
const address = packageSchema.$defs.address;
const selection = { type: 'object', properties: { collection: address, mode: id }, required: ['collection', 'mode'], additionalProperties: false };
const validateOptions = ajv.compile({ type: 'object', properties: {
  maxContexts: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  themes: { type: 'array', items: { anyOf: [id, address] } },
  modes: { type: 'array', items: selection },
}, additionalProperties: false });
export function checkOptions(options) {
  if (!validateOptions(options)) fail('ARGUMENT_INVALID', `Invalid evaluation options: ${validateOptions.errors[0].instancePath} ${validateOptions.errors[0].message}`);
}
export function checkManifestStructure(unit) {
  if (!validateManifest(unit.document)) fail('STRUCTURE_INVALID', `Invalid authoring manifest: ${validateManifest.errors[0].message}`, { file: unit.file, pointer: validateManifest.errors[0].instancePath });
}
export function checkStructure(unit) {
  if (!validatePackage(unit.document)) {
    const meaningful = validatePackage.errors.filter(e => e.keyword !== 'const' && e.keyword !== 'oneOf');
    const first = meaningful.find(e => e.instancePath.startsWith('/resources/') && e.keyword !== 'required') ?? meaningful[0] ?? validatePackage.errors[0];
    fail('STRUCTURE_INVALID', `${first.message} (${first.schemaPath})`, { file: unit.file, pointer: first.instancePath });
  }
}
export function checkValue(type, value, details) {
  const validator = validators.get(type);
  if (!validator || !validator(value)) {
    const first = validator?.errors?.[0];
    fail('TYPE_MISMATCH', `Expected ${type}${first ? `: ${first.instancePath || '/'} ${first.message}` : ''}`, details);
  }
  if (type === 'timing' && value < 0) fail('TYPE_MISMATCH', 'Timing values are nonnegative seconds', details);
}
