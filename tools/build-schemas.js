import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as TJS from 'typescript-json-schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const output = 'schemas/0.1.0';
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync('docs', { recursive: true });
const write = (name, value) => fs.writeFileSync(name, JSON.stringify(value, null, 2) + '\n');
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const str = { type: 'string' };
const nonempty = { type: 'string', minLength: 1 };
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' };
const num = { type: 'number' };
const positive = { type: 'number', exclusiveMinimum: 0 };
const nonnegative = { type: 'number', minimum: 0 };
const ratio = { type: 'number', minimum: 0, maximum: 1 };
const en = (...values) => ({ enum: values });
const list = (items, extra = {}) => ({ type: 'array', items, ...extra });
const dict = (schema, keys = id) => ({ type: 'object', propertyNames: keys, additionalProperties: schema });
const ref = name => ({ $ref: `#/$defs/${name}` });
const sha = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const semver = { type: 'string', pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$' };
const address = obj({ resource: id, dependency: id }, ['resource']);
const selection = obj({ collection: address, mode: id });
const meta = { $schema: 'https://json-schema.org/draft/2020-12/schema' };

// Compile native data shapes, then apply the independently specified FFS mappings.
const program = TJS.getProgramFromFiles(['tools/native-contract.ts'], { strictNullChecks: true, skipLibCheck: true });
const native = TJS.generateSchema(program, 'NativeContract', {
  required: true, noExtraProps: true, aliasRef: true, ref: true, skipLibCheck: true,
});
if (!native) throw new Error('Unable to compile Figma data contract');
const names = new Map(Object.keys(native.definitions).map(key => [key,
  /^[A-Za-z][A-Za-z0-9_]*$/.test(key) ? `native-${key}` : `shape-${createHash('sha256').update(key).digest('hex').slice(0, 12)}`,
]));
const inventory = [];
function transform(node) {
  if (Array.isArray(node)) return node.map(transform);
  if (!node || typeof node !== 'object') return node;
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (['description', 'title', 'default', '$schema', 'definitions'].includes(key)) continue;
    if (key === 'properties') {
      result.properties = Object.fromEntries(Object.entries(value).map(([name, shape]) => [name, transform(shape)]));
    } else if (key === '$ref') {
      const name = decodeURIComponent(value.replace('#/definitions/', ''));
      result.$ref = `#/$defs/${names.get(name)}`;
    } else if (key === 'items' && Array.isArray(value)) {
      result.prefixItems = value.map(transform);
      result.items = false;
    } else result[key] = transform(value);
  }
  if (result.properties) {
    delete result.properties.boundVariables;
    if (result.required) result.required = result.required.filter(key => key !== 'boundVariables');
    for (const [key, value] of Object.entries(result.properties)) {
      if (value.type === 'number') {
        if (['opacity', 'density', 'cornerSmoothing', 'bounce'].includes(key)) Object.assign(value, ratio);
        if (['radius', 'startRadius', 'noiseSize', 'fontSize', 'gutterSize', 'sectionSize', 'strokeWeight', 'duration', 'mass', 'stiffness', 'damping'].includes(key)) value.minimum = key === 'fontSize' ? 1 : 0;
        if (['count', 'gridRowCount', 'gridColumnCount', 'gridRowSpan', 'gridColumnSpan', 'maxLines'].includes(key)) Object.assign(value, { type: 'integer', minimum: 1 });
      }
    }
  }
  return result;
}
const defs = {};
for (const [key, value] of Object.entries(native.definitions)) {
  defs[names.get(key)] = key.startsWith('VariableAlias') ? false : transform(value);
  if (value.properties) inventory.push({ nativeType: key, fields: Object.keys(value.properties), required: value.required ?? [] });
}
const tuple = items => ({ type: 'array', prefixItems: items, items: false, minItems: items.length, maxItems: items.length });
const hue = { type: 'number', minimum: 0, exclusiveMaximum: 360 };
const color = { oneOf: [
  obj({ space: en('srgb', 'display-p3'), channels: tuple([ratio, ratio, ratio]), alpha: ratio }),
  obj({ space: en('hsl', 'hsb'), channels: tuple([hue, ratio, ratio]), alpha: ratio }),
  obj({ space: { const: 'oklab' }, channels: tuple([ratio, num, num]), alpha: ratio }),
  obj({ space: { const: 'oklch' }, channels: tuple([ratio, nonnegative, hue]), alpha: ratio }),
] };
for (const [key, mapped] of names) {
  if (/^(RGB|RGBA|RGBWithColorSpace|RGBAWithColorSpace)(_[0-9]+)?$/.test(key)) defs[mapped] = structuredClone(color);
}
const paintNames = ['SolidPaint', 'GradientPaint', 'ImagePaint', 'VideoPaint', 'PatternPaint', 'ShaderPaint'];
const effectNames = ['DropShadowEffect', 'InnerShadowEffect', 'BlurEffectNormal', 'BlurEffectProgressive', 'NoiseEffectMonotone', 'NoiseEffectDuotone', 'NoiseEffectMultitone', 'TextureEffect', 'GlassEffect', 'ShaderEffect'];
for (const key of [...paintNames, ...effectNames, 'GridLayoutGrid', 'RowsColsLayoutGrid', 'ColorStop']) {
  const schema = defs[names.get(key)];
  schema.properties.itemId = id;
  schema.required = [...new Set([...(schema.required ?? []), 'itemId'])];
}
for (const [name, field] of [['ImagePaint', 'imageHash'], ['VideoPaint', 'videoHash'], ['PatternPaint', 'sourceNodeId'], ['ShaderPaint', 'id'], ['ShaderEffect', 'id']]) {
  const schema = defs[names.get(name)];
  delete schema.properties[field];
  schema.properties.asset = address;
  schema.required = [...schema.required.filter(key => key !== field), 'asset'];
}
const animation = defs[names.get('AppliedFigmaAnimationStyle')];
delete animation.properties.styleId;
animation.properties.asset = address;
animation.required = [...animation.required.filter(k => k !== 'styleId'), 'asset'];
// REST exposes a few data distinctions that the Plugin API does not.
const pattern = defs[names.get('PatternPaint')];
pattern.properties.verticalAlignment = en('START', 'CENTER', 'END');
const image = defs[names.get('ImagePaint')];
image.properties.gifAsset = address;
image.properties.scaleMode.enum.push('STRETCH');
const gradient = defs[names.get('GradientPaint')];
gradient.required = gradient.required.filter(key => key !== 'gradientTransform');
gradient.properties.gradientHandlePositions = list(ref(names.get('Vector')), { minItems: 3, maxItems: 3 });
gradient.oneOf = [
  { required: ['gradientTransform'], not: { required: ['gradientHandlePositions'] } },
  { required: ['gradientHandlePositions'], not: { required: ['gradientTransform'] } },
];
defs['rest-EmojiPaint'] = obj({ itemId: id, type: { const: 'EMOJI' }, asset: address, emoji: nonempty, visible: { type: 'boolean' }, opacity: ratio, blendMode: ref(names.get('BlendMode')) }, ['itemId', 'type', 'asset']);
defs[names.get('Paint')].anyOf.push(ref('rest-EmojiPaint'));
defs[names.get('LineHeight')].anyOf.push(obj({ value: nonnegative, unit: { const: 'INTRINSIC_PERCENT' } }));
defs[names.get('TextPreset')].properties.fontPostScriptName = nonempty;
defs[names.get('FontName')].properties.asset = address;
for (const [key, mapped] of names) {
  if (key.startsWith('ImageFilters')) for (const property of Object.values(defs[mapped].properties ?? {})) Object.assign(property, { minimum: -1, maximum: 1 });
  if (key.startsWith('FontVariationSettings') && defs[mapped].type === 'object') defs[mapped].propertyNames = { type: 'string', pattern: '^[ -~]{4}$' };
  if (key.startsWith('EasingFunctionBezier') && defs[mapped].properties) for (const field of ['x1', 'x2']) Object.assign(defs[mapped].properties[field], ratio);
}
for (const field of ['mass', 'stiffness']) Object.assign(defs[names.get('PhysicalSpring')].properties[field], positive);
const region = defs[names.get('VectorRegion')];
delete region.properties.fillStyleId;
region.properties.fillStyle = address;
for (const key of ['RowsColsLayoutGrid']) defs[names.get(key)].properties.count = { anyOf: [{ type: 'integer', minimum: 1 }, { const: 'auto' }] };
// Optional feature flags must not require every OpenType tag to be supplied.
for (const node of Object.values(defs)) if (node?.properties?.PCAP && node?.properties?.CV99) delete node.required;

const quantities = {
  length: obj({ amount: num, unit: en('px') }),
  angle: obj({ amount: num, unit: en('deg', 'rad') }),
  duration: obj({ amount: nonnegative, unit: en('ms', 's') }),
};
const registry = { boolean: { type: 'boolean' }, string: str, number: num, timing: nonnegative, ratio, color, ...quantities,
  point: obj({ space: en('pixels', 'normalized'), x: num, y: num }),
  transform: obj({ space: en('pixels', 'normalized'), matrix: transform(native.definitions.Transform) }),
  ...Object.fromEntries(Object.entries(native.properties).map(([key, value]) => [key, transform(value)])),
};
Object.assign(defs, Object.fromEntries(Object.entries(registry).map(([key, value]) => [`type-${key}`, value])));
const valuesSchema = { ...meta, $id: 'urn:ffs:0.1.0:values', $defs: defs };
write(`${output}/values.schema.json`, valuesSchema);

const common = {
  name: nonempty, description: str, descriptionMarkdown: str,
  documentationLinks: list(nonempty), tags: list(nonempty, { uniqueItems: true }),
  deprecated: obj({ reason: nonempty, replacement: address }, ['reason']),
  hiddenFromPublishing: { type: 'boolean' },
  sourceLinks: list(obj({ source: id, objectId: nonempty, libraryKey: nonempty, remote: { type: 'boolean' }, publishStatus: en('UNPUBLISHED', 'CURRENT', 'CHANGED'), fields: dict(str, nonempty) }, ['source', 'objectId'])),
  extensions: dict({}, { type: 'string', pattern: '^[a-z0-9-]+(?:\\.[a-z0-9-]+)+(?:/[A-Za-z0-9._-]+)?$' }),
};
const expr = ref('expression');
const resources = [
  obj({ ...common, kind: { const: 'value' }, dataType: en(...Object.keys(registry)), expression: expr }, ['kind', 'name', 'dataType', 'expression']),
  obj({ ...common, kind: { const: 'variable' }, dataType: en('color', 'number', 'string', 'boolean', 'easing', 'timing'), collection: address, values: dict(expr),
    scopes: list(en('ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY', 'COLOR_OPACITY', 'FONT_FAMILY', 'FONT_STYLE', 'FONT_VARIATIONS', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT'), { uniqueItems: true }),
    codeSyntax: obj({ WEB: str, ANDROID: str, iOS: str }, []),
  }, ['kind', 'name', 'dataType', 'collection', 'values']),
  obj({ ...common, kind: { const: 'collection' }, modes: { ...dict(obj({ name: nonempty })), minProperties: 1 }, defaultMode: id,
    extends: address, modeMap: dict(id), overrides: list(obj({ variable: address, values: dict(expr) })),
    modeOrder: list(id, { uniqueItems: true }), variableOrder: list(address),
  }, ['kind', 'name', 'modes', 'defaultMode']),
  obj({ ...common, kind: { const: 'style' }, family: en('paint', 'text', 'effect', 'grid', 'motion'), expression: expr }, ['kind', 'name', 'family', 'expression']),
  obj({ ...common, kind: { const: 'preset' }, target: en('text.properties', 'stroke.properties', 'corner.properties', 'layout.properties', 'motion.properties'), expression: expr }, ['kind', 'name', 'target', 'expression']),
  obj({ ...common, kind: { const: 'theme' }, selections: list(selection) }, ['kind', 'name', 'selections']),
  obj({ ...common, kind: { const: 'asset' }, mediaType: { type: 'string', pattern: '^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$' }, content: { oneOf: [
    obj({ kind: { const: 'file' }, path: nonempty, sha256: sha, byteLength: { type: 'integer', minimum: 0 } }),
    obj({ kind: { const: 'embedded' }, base64: str, sha256: sha, byteLength: { type: 'integer', minimum: 0 } }),
    obj({ kind: { const: 'external' }, provider: nonempty, id: nonempty, version: nonempty }, ['kind', 'provider', 'id']),
  ] } }, ['kind', 'name', 'mediaType', 'content']),
];
const expression = { oneOf: [
  obj({ literal: {} }),
  obj({ ref: obj({ ...address.properties, pointer: { type: 'string', pattern: '^(?:/(?:[^~/]|~[01])*)*$' }, modes: list(selection) }, ['resource']) }),
  obj({ bind: obj({ variable: id, dependency: id }, ['variable']) }),
  obj({ record: dict(expr, { type: 'string' }) }),
  obj({ list: list(expr) }),
  obj({ color: obj({ base: expr, alpha: expr, alphaUnit: en('ratio', 'percent'), operation: en('replace', 'multiply') }) }),
] };
const packageProperties = {
  $schema: str, format: { const: 'figma-foundations' }, formatVersion: { const: '0.1.0' },
  package: obj({ id, name: nonempty, version: semver, description: str }, ['id', 'name', 'version']),
  dependencies: dict(obj({ id, version: semver, path: nonempty, sha256: sha })),
  resources: dict(ref('resource')),
  organization: list(ref('organization')),
  sources: dict(obj({ product: { const: 'figma-design' }, fileKey: nonempty, versionId: nonempty, capturedAt: nonempty, apiSurface: en('plugin', 'rest', 'manual'), apiVersion: nonempty, colorProfile: en('SRGB', 'DISPLAY_P3') }, ['product', 'apiSurface'])),
  requires: list(obj({ id: nonempty, version: semver })),
};
const core = { ...meta, $id: 'urn:ffs:0.1.0:package', ...obj(packageProperties, ['format', 'formatVersion', 'package', 'dependencies', 'resources', 'organization', 'sources']),
  $defs: { expression, address, resource: { oneOf: resources }, organization: { oneOf: [obj({ resource: id }), obj({ id, name: nonempty, children: list(ref('organization')) })] } },
};
write(`${output}/package.schema.json`, core);
const manifestProperties = { ...packageProperties, format: { const: 'figma-foundations-manifest' }, resources: list(nonempty, { minItems: 1, uniqueItems: true }) };
write(`${output}/manifest.schema.json`, { ...core, $id: 'urn:ffs:0.1.0:manifest', ...obj(manifestProperties, core.required) });
write(`${output}/resources.schema.json`, { ...meta, $id: 'urn:ffs:0.1.0:resources', ...dict({ $ref: 'urn:ffs:0.1.0:package#/$defs/resource' }) });

const types = JSON.parse(fs.readFileSync('node_modules/@figma/plugin-typings/package.json'));
const rawTypes = fs.readFileSync('node_modules/@figma/plugin-typings/plugin-api.d.ts');
write('docs/figma-baseline.json', { reviewedOn: '2026-10-20', package: '@figma/plugin-typings', version: types.version,
  sha256: createHash('sha256').update(rawTypes).digest('hex'),
  source: 'https://github.com/figma/plugin-typings', types: inventory,
});
fs.writeFileSync('docs/THIRD_PARTY_NOTICES.txt', 'The native field contracts are derived from @figma/plugin-typings.\nFFS package architecture, expressions, and resolution are independently defined.\n\n' + fs.readFileSync('node_modules/@figma/plugin-typings/LICENSE', 'utf8'));

// A browsable ledger of every resolved field, including union branches.
const lines = ['# Resolved value field reference', '', 'Generated by `npm run build`. Payload keys and enums follow the pinned Figma baseline except the explicit FFS normalizations in the specification. Required/optional means serialized data presence; a preset omission means leave that property unspecified.', ''];
function describe(node, prefix, seen = new Set()) {
  if (!node || typeof node !== 'object') return;
  if (node.$ref) {
    const key = node.$ref.split('/').at(-1);
    if (seen.has(key)) return;
    return describe(defs[key], prefix, new Set([...seen, key]));
  }
  for (const branch of node.anyOf ?? node.oneOf ?? []) describe(branch, prefix, seen);
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    const label = `${prefix}/${key}`;
    const summary = value.const !== undefined ? JSON.stringify(value.const) : value.enum ? value.enum.map(x => JSON.stringify(x)).join(', ') : value.$ref ? value.$ref.split('/').at(-1) : JSON.stringify(value);
    lines.push(`| \`${label}\` | ${(node.required ?? []).includes(key) ? 'required' : 'optional'} | \`${summary.replaceAll('|', '\\|')}\` |`);
    describe(value, label, seen);
  }
  if (node.items && typeof node.items === 'object') describe(node.items, `${prefix}/*`, seen);
}
for (const [name, value] of Object.entries(registry)) {
  lines.push(`## ${name}`, '', `Root contract: \`${JSON.stringify(value).replaceAll('`', '')}\``, '', '| Field | Presence | Contract |', '| --- | --- | --- |');
  describe(value, '');
  lines.push('');
}
fs.writeFileSync('docs/fields.md', lines.join('\n').trimEnd() + '\n');
console.log(`Built ${Object.keys(registry).length} value types and ${Object.keys(defs).length} schema definitions against Figma ${types.version}.`);
