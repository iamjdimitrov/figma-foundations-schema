import fs from 'node:fs';
import { digest } from '../src/io.js';

const write = (file, data) => { fs.mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); };
const literal = value => ({ literal: value });
const reference = resource => ({ ref: { resource } });
const value = (name, dataType, data) => ({ kind: 'value', name, dataType, expression: literal(data) });
const color = channels => ({ space: 'srgb', channels, alpha: 1 });
const white = color([1, 1, 1]), black = color([0, 0, 0]);
const doc = JSON.parse(fs.readFileSync('examples/surface.foundation.json', 'utf8'));
doc.package = { id: 'catalog-foundations', name: 'Foundations coverage catalog', version: '1.0.0' };
const r = doc.resources;
const asset = (id, mediaType, provider, providerId) => {
  r[id] = { kind: 'asset', name: id, mediaType, content: { kind: 'external', provider, id: providerId, version: 'example-1' } };
  return { resource: id };
};
const image = asset('image-asset', 'image/svg+xml', 'example-library', 'illustration');
const video = asset('video-asset', 'video/mp4', 'example-library', 'ambient-video');
const shader = asset('shader-asset', 'application/vnd.figma.shader', 'figma', 'example-shader');
const animation = asset('animation-asset', 'application/vnd.figma.animation-style', 'figma', 'example-animation');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="3" fill="black"/></svg>');
r['pattern-asset'] = { kind: 'asset', name: 'Pattern artwork', mediaType: 'image/svg+xml', content: { kind: 'embedded', base64: svg.toString('base64'), byteLength: svg.length, sha256: digest(svg) } };
const paints = [{ itemId: 'solid', type: 'SOLID', color: white, opacity: 0.8, blendMode: 'NORMAL', visible: true }];
for (const type of ['LINEAR', 'RADIAL', 'ANGULAR', 'DIAMOND']) paints.push({
  itemId: type.toLowerCase(), type: `GRADIENT_${type}`,
  gradientTransform: [[1, 0.2, 0.1], [0, 1, 0]],
  gradientStops: [{ itemId: 'start', position: 0, color: white }, { itemId: 'end', position: 1, color: black }],
});
paints.push(
  { itemId: 'image', type: 'IMAGE', asset: image, scaleMode: 'CROP', imageTransform: [[1, 0, 0], [0, 1, 0]], filters: { exposure: 0.1, saturation: -0.2 } },
  { itemId: 'video', type: 'VIDEO', asset: video, scaleMode: 'TILE', scalingFactor: 2, rotation: 90 },
  { itemId: 'pattern', type: 'PATTERN', asset: { resource: 'pattern-asset' }, tileType: 'HORIZONTAL_HEXAGONAL', scalingFactor: 1, spacing: { x: 4, y: 4 }, horizontalAlignment: 'CENTER' },
  { itemId: 'shader', type: 'SHADER', asset: shader, properties: { strength: 0.4 }, propertyMetadata: { strength: { name: 'Strength', type: 'NUMBER', defaultValue: 0.5 } } },
);
r['paint-catalog'] = { kind: 'style', name: 'All paint variants', family: 'paint', expression: literal(paints) };
paints.push({ itemId: 'emoji', type: 'EMOJI', emoji: '✨', asset: image });
paints.push({ itemId: 'rest-gradient', type: 'GRADIENT_LINEAR', gradientHandlePositions: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], gradientStops: [{ itemId: 'first', position: 0, color: white }, { itemId: 'last', position: 1, color: black }] });
const shadow = type => ({ itemId: type.toLowerCase(), type, color: { ...black, alpha: 0.2 }, offset: { x: 0, y: 4 }, radius: 8, spread: -1, visible: true, blendMode: 'NORMAL' });
const effects = [shadow('DROP_SHADOW'), shadow('INNER_SHADOW')];
for (const type of ['LAYER_BLUR', 'BACKGROUND_BLUR']) {
  effects.push({ itemId: `${type}-normal`, type, blurType: 'NORMAL', radius: 12, visible: true });
  effects.push({ itemId: `${type}-progressive`, type, blurType: 'PROGRESSIVE', radius: 12, startRadius: 0, startOffset: { x: 0, y: 0 }, endOffset: { x: 1, y: 1 }, visible: true });
}
for (const noiseType of ['MONOTONE', 'DUOTONE', 'MULTITONE']) effects.push({ itemId: `noise-${noiseType}`, type: 'NOISE', noiseType, color: black, visible: true, blendMode: 'NORMAL', noiseSize: 1, noiseSizeVector: { x: 1, y: 2 }, density: 0.5,
  ...(noiseType === 'DUOTONE' ? { secondaryColor: white } : {}), ...(noiseType === 'MULTITONE' ? { opacity: 0.3 } : {}),
});
effects.push(
  { itemId: 'texture', type: 'TEXTURE', visible: true, noiseSize: 1, radius: 4, clipToShape: true },
  { itemId: 'glass', type: 'GLASS', visible: true, lightIntensity: 1, lightAngle: 45, refraction: 0.4, depth: 8, dispersion: 0.1, radius: 4 },
  { itemId: 'shader', type: 'SHADER', visible: true, asset: shader, properties: { strength: 0.4 } },
);
r['effect-catalog'] = { kind: 'style', name: 'All effect variants', family: 'effect', expression: literal(effects) };
r['grid-catalog'] = { kind: 'style', name: 'Layout guides', family: 'grid', expression: literal([
  { itemId: 'square', pattern: 'GRID', sectionSize: 8, visible: true, color: { ...black, alpha: 0.1 } },
  { itemId: 'columns', pattern: 'COLUMNS', alignment: 'STRETCH', count: 12, gutterSize: 24, offset: 32 },
  { itemId: 'rows', pattern: 'ROWS', alignment: 'MIN', count: 'auto', sectionSize: 24, gutterSize: 8, offset: 0 },
]) };
r['text-body'] = { kind: 'style', name: 'Body', family: 'text', expression: literal({ fontName: { family: 'Inter', style: 'Regular', variationSettings: { wght: 400 } }, fontSize: 16, textDecoration: 'NONE', letterSpacing: { unit: 'PERCENT', value: 0 }, lineHeight: { unit: 'AUTO' }, leadingTrim: 'NONE', paragraphIndent: 0, paragraphSpacing: 8, listSpacing: 4, hangingPunctuation: true, hangingList: false, textCase: 'ORIGINAL', textWrapStyle: 'PRETTY' }) };
r['text-detail'] = { kind: 'preset', name: 'Detailed text properties', target: 'text.properties', expression: literal({ textAlignHorizontal: 'JUSTIFIED', textAlignVertical: 'TOP', textAutoResize: 'HEIGHT', fontWeight: 450, fontStyle: 'ITALIC', fontName: { family: 'Inter', style: 'Italic', variationSettings: { wght: 450, slnt: -8 } }, openTypeFeatures: { LIGA: true, KERN: true }, textDecoration: 'UNDERLINE', textDecorationStyle: 'WAVY', textDecorationOffset: { unit: 'AUTO' }, textDecorationThickness: { unit: 'PIXELS', value: 1 }, textDecorationColor: { value: 'AUTO' }, textDecorationSkipInk: true, listOptions: { type: 'ORDERED' }, indentation: 1 }) };
r['stroke-custom'] = { kind: 'preset', name: 'Variable-width stroke', target: 'stroke.properties', expression: literal({ strokes: [paints[0]], strokeWeight: 2, strokeJoin: 'ROUND', strokeAlign: 'CENTER', dashPattern: [4, 2], strokeCap: 'ROUND', strokeMiterLimit: 4, variableWidthStrokeProperties: { widthProfile: 'CUSTOM', variableWidthPoints: [{ position: 0, width: 1 }, { position: 1, width: 4 }] }, complexStrokeProperties: { type: 'DYNAMIC', frequency: 0.3, wiggle: 0.2, smoothen: 0.4 } }) };
r['corners-soft'] = { kind: 'preset', name: 'Soft corners', target: 'corner.properties', expression: literal({ topLeftRadius: 8, topRightRadius: 8, bottomLeftRadius: 8, bottomRightRadius: 8, cornerSmoothing: 0.6 }) };
r['layout-grid'] = { kind: 'preset', name: 'Grid layout', target: 'layout.properties', expression: literal({ layoutMode: 'GRID', paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16, gridRowCount: 2, gridColumnCount: 2, gridRowGap: 8, gridColumnGap: 8, gridRowSizes: [{ type: 'HUG' }, { type: 'FIXED', value: 48 }], gridColumnSizes: [{ type: 'FLEX', value: 1 }, { type: 'FLEX', value: 1 }], gridAutoTracks: 'ROWS', gridItemsPositioning: 'ROW_AUTO_FLOW', layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG' }) };
r['motion-standard'] = { kind: 'style', name: 'Entrance', family: 'motion', expression: literal({ animationEntries: [{ type: 'FIGMA', id: 'entry-1', name: 'Fade', asset: animation, duration: 0.3, timelineOffset: 0, props: { easing: { type: 'LINEAR' }, amount: 1 } }] }) };
r['motion-offset'] = { kind: 'preset', name: 'Motion offset', target: 'motion.properties', expression: literal({ type: 'CUSTOM', timelineOffset: 0.1 }) };
r['easing-bezier'] = value('Ease out', 'easing', { type: 'CUSTOM_CUBIC_BEZIER', easingFunctionCubicBezier: { x1: 0.2, y1: 0, x2: 0, y2: 1 } });
r['spring-physical'] = value('Physical spring', 'spring', { mass: 1, stiffness: 200, damping: 20 });
r['easing-spring'] = value('Normalized spring', 'easing', { type: 'CUSTOM_SPRING', easingFunctionSpring: { bounce: 0.3 } });
r['duration-standard'] = value('Standard duration', 'duration', { amount: 200, unit: 'ms' });
r['rotation-standard'] = value('Quarter turn', 'angle', { amount: 90, unit: 'deg' });
r['point-anchor'] = value('Anchor', 'point', { space: 'normalized', x: 0.5, y: 0.5 });
r['transform-identity'] = value('Identity', 'transform', { space: 'normalized', matrix: [[1, 0, 0], [0, 1, 0]] });
r['opacity-standard'] = value('Opacity', 'ratio', 0.5);
r['artwork'] = value('Vector artwork', 'vectorArtwork', { vertices: [{ x: 0, y: 0 }, { x: 10, y: 10 }], segments: [{ start: 0, end: 1 }] });
for (const [space, channels] of [['display-p3', [0.8, 0.2, 0.4]], ['hsl', [240, 0.5, 0.5]], ['hsb', [120, 0.8, 1]], ['oklab', [0.6, -0.1, 0.1]], ['oklch', [0.6, 0.2, 250]]]) r[`color-${space}`] = value(space, 'color', { space, channels, alpha: 1 });
r['constants'] = { kind: 'collection', name: 'Constants', modes: { base: { name: 'Base' } }, defaultMode: 'base' };
for (const [id, type, data] of [['var-size', 'number', 16], ['var-enabled', 'boolean', true], ['var-label', 'string', 'Continue'], ['var-easing', 'easing', { type: 'LINEAR' }], ['var-timing', 'timing', 0.3]]) r[id] = { kind: 'variable', name: id, dataType: type, collection: { resource: 'constants' }, values: { base: literal(data) } };
r['color-composed'] = { kind: 'variable', name: 'Translucent canvas', dataType: 'color', collection: { resource: 'constants' }, values: { base: { record: { space: literal('srgb'), channels: { ref: { resource: 'surface-color', pointer: '/channels' } }, alpha: literal(0.5) } } } };
r['var-opacity'] = { kind: 'variable', name: 'Opacity percentage', dataType: 'number', collection: { resource: 'constants' }, values: { base: literal(50) } };
r['color-with-opacity'] = { kind: 'variable', name: 'Composed authored color', dataType: 'color', collection: { resource: 'constants' }, values: { base: { color: { base: reference('surface-color'), alpha: reference('var-opacity'), alphaUnit: 'percent', operation: 'multiply' } } } };
r['brand'] = { kind: 'collection', name: 'Brand appearance', extends: { resource: 'appearance' }, modes: { 'brand-day': { name: 'Light' }, 'brand-night': { name: 'Dark' } }, defaultMode: 'brand-day', modeMap: { 'brand-day': 'day', 'brand-night': 'night' }, overrides: [{ variable: { resource: 'surface-color' }, values: { 'brand-day': reference('color-display-p3') } }] };
r['theme-brand'] = { kind: 'theme', name: 'Brand light', selections: [{ collection: { resource: 'brand' }, mode: 'brand-day' }] };
write('examples/catalog.foundation.json', doc);

// Static negative fixtures are useful to independent implementations, not only tests.
const base = JSON.parse(fs.readFileSync('examples/surface.foundation.json'));
const cases = [];
function invalid(name, code, mutate) {
  const document = structuredClone(base); mutate(document);
  const file = `invalid/${name}.json`; write(`conformance/${file}`, document);
  cases.push({ file, valid: false, error: code });
}
invalid('missing-reference', 'REFERENCE_MISSING', d => d.resources['surface-color'].values.night.ref.resource = 'missing');
invalid('inactive-mode-cycle', 'CYCLE', d => d.resources['surface-color'].values.night.ref.resource = 'surface-color');
invalid('missing-mode-value', 'MODE_MISSING', d => delete d.resources['surface-color'].values.night);
invalid('unknown-mode-value', 'MODE_MISSING', d => d.resources['surface-color'].values.typo = literal(1));
invalid('wrong-alias-type', 'TYPE_MISMATCH', d => d.resources['surface-color'].values.night = literal('black'));
invalid('unrecognized-field', 'STRUCTURE_INVALID', d => d.resources['surface-color'].valeus = {});
invalid('unrecognized-type', 'STRUCTURE_INVALID', d => d.resources['color-white'].dataType = 'custom-color');
invalid('invalid-binding-position', 'BINDING_INVALID', d => { d.resources['color-copy'] = { kind: 'value', name: 'Copy', dataType: 'color', expression: { bind: { variable: 'surface-color' } } }; });
invalid('variable-binding-in-value', 'BINDING_INVALID', d => d.resources['surface-color'].values.day = { bind: { variable: 'surface-color' } });
invalid('missing-pointer', 'POINTER_MISSING', d => d.resources['surface-color'].values.day.ref.pointer = '/does-not-exist');
invalid('bad-pointer-escape', 'STRUCTURE_INVALID', d => d.resources['surface-color'].values.day.ref.pointer = '/~2');
invalid('required-extension', 'EXTENSION_REQUIRED', d => d.requires = [{ id: 'example.org/custom', version: '1.0.0' }]);
invalid('invalid-alpha', 'TYPE_MISMATCH', d => d.resources['color-white'].expression.literal.alpha = 1.1);
invalid('invalid-theme-mode', 'MODE_MISSING', d => d.resources['theme-dark'].selections[0].mode = 'missing');
invalid('duplicate-selection', 'MODE_CONFLICT', d => d.resources['theme-dark'].selections.push(d.resources['theme-dark'].selections[0]));
invalid('invalid-scope', 'SCOPE_INVALID', d => d.resources['surface-color'].scopes = ['FONT_SIZE']);
invalid('exclusive-scope', 'SCOPE_INVALID', d => d.resources['surface-color'].scopes.push('ALL_SCOPES'));
invalid('unknown-source', 'SOURCE_MISSING', d => d.resources['color-white'].sourceLinks = [{ source: 'missing', objectId: '123' }]);
invalid('duplicate-stack-item', 'ITEM_DUPLICATE', d => { const stack = d.resources['canvas-style'].expression.list; stack.push(structuredClone(stack[0])); });
invalid('wrong-native-enum', 'TYPE_MISMATCH', d => d.resources['canvas-style'].expression.list[0].record.type = literal('solid'));
invalid('asset-integrity', 'ASSET_INTEGRITY', d => d.resources.asset = { kind: 'asset', name: 'Invalid', mediaType: 'image/png', content: { kind: 'embedded', base64: 'YQ==', byteLength: 1, sha256: '0'.repeat(64) } });
invalid('missing-dependency', 'DEPENDENCY_MISSING', d => d.dependencies.library = { id: 'library', version: '1.0.0', path: 'library.json', sha256: '0'.repeat(64) });
write('conformance/manifest.json', { formatVersion: '0.1.0', cases: [
  { file: '../examples/surface.foundation.json', valid: true },
  { file: '../examples/catalog.foundation.json', valid: true }, ...cases,
] });
console.log(`Wrote catalog with ${Object.keys(r).length} resources and ${cases.length} negative fixtures.`);
