import fs from 'node:fs';
import { fail, escapePointer } from './errors.js';
import { checkStructure, checkValue } from './schema.js';
import { assertJSON, digest, safeFile, parseJSON } from './io.js';

const own = (value, key) => Object.hasOwn(value, key);
const styleType = { paint: 'paintStack', text: 'textStyle', effect: 'effectStack', grid: 'gridStack', motion: 'motionStyle' };
const presetType = { 'text.properties': 'textProperties', 'stroke.properties': 'stroke', 'corner.properties': 'corners', 'layout.properties': 'layoutProperties', 'motion.properties': 'motionProperties' };
const typeOf = resource => resource.dataType ?? styleType[resource.family] ?? presetType[resource.target];
const valueKinds = new Set(['value', 'variable', 'style', 'preset']);
const asAddress = bind => ({ resource: bind.variable, ...(bind.dependency ? { dependency: bind.dependency } : {}) });

export function createModel(root, { maxContexts = 4096 } = {}) {
  const units = [], seenUnits = new Set(), activeUnits = new Set(), nodes = new Map(), identities = new Map();
  function visit(unit) {
    if (activeUnits.has(unit)) fail('DEPENDENCY_CYCLE', 'Package dependencies form a cycle', { file: unit.file });
    if (seenUnits.has(unit)) return;
    activeUnits.add(unit);
    seenUnits.add(unit); assertJSON(unit.document, unit.file); checkStructure(unit);
    if (unit.document.requires?.length) fail('EXTENSION_REQUIRED', 'This evaluator implements core FFS only; required semantic extensions need an implementation', { file: unit.file, pointer: '/requires' });
    const identity = JSON.stringify([unit.document.package.id, unit.document.package.version]);
    if (identities.has(identity)) {
      const previous = identities.get(identity);
      if ((unit.sha256 ?? digest(JSON.stringify(unit.document))) !== (previous.sha256 ?? digest(JSON.stringify(previous.document)))) fail('DEPENDENCY_IDENTITY', 'One package identity has different content', { file: unit.file });
      unit.canonical = previous;
      activeUnits.delete(unit);
      return;
    }
    identities.set(identity, unit); units.push(unit);
    const deps = unit.document.dependencies;
    if (Object.keys(deps).some(alias => !unit.dependencies?.has(alias))) fail('DEPENDENCY_MISSING', 'Declared dependency was not supplied by a package loader', { file: unit.file, pointer: '/dependencies' });
    for (const [alias, dependency] of unit.dependencies ?? []) {
      const descriptor = deps[alias];
      if (!descriptor || descriptor.id !== dependency.document.package?.id || descriptor.version !== dependency.document.package?.version) fail('DEPENDENCY_IDENTITY', `Dependency identity differs: ${alias}`, { file: unit.file });
      if (descriptor.sha256 !== dependency.sha256) fail('DEPENDENCY_INTEGRITY', `Dependency digest differs: ${alias}`, { file: unit.file });
      visit(dependency);
    }
    activeUnits.delete(unit);
  }
  visit(root);
  for (const unit of units) {
    for (const [id, resource] of Object.entries(unit.document.resources)) {
      const uid = JSON.stringify([unit.document.package.id, unit.document.package.version, id]);
      nodes.set(uid, { uid, unit, id, resource });
    }
  }
  function details(node, pointer = '') {
    if (!node.id) return { file: node.unit.file ?? '<memory>', pointer };
    const fragment = node.unit.locations?.get(node.id);
    return { file: fragment ?? node.unit.file ?? '<memory>', resource: node.id,
      pointer: `${fragment ? '' : '/resources'}/${escapePointer(node.id)}${pointer}` };
  }
  function address(from, address, kinds) {
    let unit = from.unit;
    if (address.dependency) {
      unit = unit.dependencies?.get(address.dependency);
      if (!unit) fail('DEPENDENCY_MISSING', `Unknown dependency ${address.dependency}`, details(from));
    }
    unit = unit.canonical ?? unit;
    const uid = JSON.stringify([unit.document.package.id, unit.document.package.version, address.resource]);
    const node = nodes.get(uid);
    if (!node) fail('REFERENCE_MISSING', `Unknown resource ${address.resource}`, details(from));
    if (kinds && !kinds.includes(node.resource.kind)) fail('REFERENCE_KIND', `Expected ${kinds.join(' or ')}, found ${node.resource.kind}`, details(from));
    return node;
  }

  const collections = [...nodes.values()].filter(n => n.resource.kind === 'collection');
  const parent = new Map(), roots = new Map();
  for (const node of collections) {
    const r = node.resource;
    if (!own(r.modes, r.defaultMode)) fail('MODE_MISSING', 'Default mode is not declared', details(node, '/defaultMode'));
    if (r.modeOrder && (r.modeOrder.length !== Object.keys(r.modes).length || r.modeOrder.some(mode => !own(r.modes, mode)))) fail('ORDER_INVALID', 'modeOrder must list every declared mode exactly once', details(node, '/modeOrder'));
    if (r.extends) {
      const p = address(node, r.extends, ['collection']); parent.set(node.uid, p);
      if (!r.modeMap || Object.keys(r.modeMap).length !== Object.keys(r.modes).length || Object.keys(r.modeMap).some(mode => !own(r.modes, mode) || !own(p.resource.modes, r.modeMap[mode]))) fail('MODE_MAP_INVALID', 'Every child mode must map to a declared parent mode', details(node, '/modeMap'));
    } else if (r.modeMap || r.overrides) fail('COLLECTION_INVALID', 'Root collections cannot have modeMap or overrides', details(node));
  }
  function rootCollection(node, active = new Set()) {
    if (roots.has(node.uid)) return roots.get(node.uid);
    if (active.has(node.uid)) fail('CYCLE', 'Collection inheritance contains a cycle', details(node));
    active.add(node.uid);
    const result = parent.has(node.uid) ? rootCollection(parent.get(node.uid), active) : node;
    roots.set(node.uid, result); return result;
  }
  for (const node of collections) rootCollection(node);
  const variableCollections = new Map(), overrides = new Map(), artwork = new Map();
  for (const node of nodes.values()) {
    const r = node.resource;
    for (const link of r.sourceLinks ?? []) if (!own(node.unit.document.sources, link.source)) fail('SOURCE_MISSING', `Unknown source ${link.source}`, details(node, '/sourceLinks'));
    if (r.deprecated?.replacement) address(node, r.deprecated.replacement);
    if (r.kind === 'variable') {
      const c = address(node, r.collection, ['collection']);
      if (parent.has(c.uid)) fail('COLLECTION_INVALID', 'Extended collections inherit variables; they cannot own cloned variables', details(node));
      variableCollections.set(node.uid, c);
      if (Object.keys(r.values).length !== Object.keys(c.resource.modes).length || Object.keys(r.values).some(mode => !own(c.resource.modes, mode))) fail('MODE_MISSING', 'Variables require exactly one value for every owning collection mode', details(node, '/values'));
      if (r.scopes?.includes('ALL_SCOPES') && r.scopes.length !== 1) fail('SCOPE_INVALID', 'ALL_SCOPES must be the only scope', details(node, '/scopes'));
      if (r.scopes?.includes('ALL_FILLS') && r.scopes.some(scope => ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'].includes(scope))) fail('SCOPE_INVALID', 'ALL_FILLS cannot be combined with individual fill scopes', details(node, '/scopes'));
      const colorScopes = new Set(['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR']);
      const stringScopes = new Set(['TEXT_CONTENT', 'FONT_FAMILY', 'FONT_STYLE', 'FONT_VARIATIONS']);
      for (const scope of r.scopes ?? []) {
        if (scope === 'ALL_SCOPES') continue;
        if (scope === 'TEXT_CONTENT' && ['number', 'string'].includes(r.dataType)) continue;
        if ((colorScopes.has(scope) ? r.dataType !== 'color' : stringScopes.has(scope) ? r.dataType !== 'string' : r.dataType !== 'number')) fail('SCOPE_INVALID', `Scope ${scope} is incompatible with ${r.dataType}`, details(node, '/scopes'));
      }
    }
    if (r.kind === 'collection' && r.extends) {
      const map = new Map();
      for (const entry of r.overrides ?? []) {
        const variable = address(node, entry.variable, ['variable']);
        const owner = address(variable, variable.resource.collection, ['collection']);
        if (owner.uid !== roots.get(node.uid).uid) fail('OVERRIDE_INVALID', 'Override must address a variable inherited from the same root collection', details(node));
        if (map.has(variable.uid)) fail('OVERRIDE_INVALID', 'Duplicate override for one inherited variable', details(node));
        if (Object.keys(entry.values).some(mode => !own(r.modes, mode))) fail('MODE_MISSING', 'Override names an unknown child mode', details(node));
        map.set(variable.uid, entry.values);
      }
      overrides.set(node.uid, map);
    }
    if (r.kind === 'asset') {
      const content = r.content;
      if (content.kind === 'external') continue;
      let bytes;
      if (content.kind === 'file') bytes = fs.readFileSync(safeFile(node.unit.directory, content.path));
      else {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content.base64)) fail('ASSET_INVALID', 'Embedded asset is not canonical base64', details(node));
        bytes = Buffer.from(content.base64, 'base64');
        if (bytes.toString('base64') !== content.base64) fail('ASSET_INVALID', 'Embedded base64 has noncanonical padding bits', details(node));
      }
      if (bytes.length !== content.byteLength || digest(bytes) !== content.sha256) fail('ASSET_INTEGRITY', 'Asset bytes do not match their declared length and digest', details(node));
      if (r.mediaType === 'application/vnd.ffs.vector+json') {
        const value = parseJSON(bytes.toString('utf8'), node.unit.file);
        checkValue('vectorArtwork', value, details(node));
        artwork.set(node.uid, value);
      }
    }
  }

  for (const collection of collections) if (collection.resource.variableOrder) {
    const root = roots.get(collection.uid);
    const expected = [...variableCollections].filter(([, owner]) => owner.uid === root.uid).map(([uid]) => uid);
    const ordered = collection.resource.variableOrder.map(a => address(collection, a, ['variable']).uid);
    if (new Set(ordered).size !== expected.length || ordered.length !== expected.length || ordered.some(uid => !expected.includes(uid))) fail('ORDER_INVALID', 'variableOrder must list the complete inherited/owned variable set once', details(collection, '/variableOrder'));
  }

  function selections(from, list) {
    const result = [], selectedRoots = new Set();
    for (const s of list ?? []) {
      const c = address(from, s.collection, ['collection']);
      if (!own(c.resource.modes, s.mode)) fail('MODE_MISSING', `Unknown mode ${s.mode}`, details(from));
      const root = roots.get(c.uid);
      if (selectedRoots.has(root.uid)) fail('MODE_CONFLICT', 'A selection list cannot select overlapping root/extended collection views', details(from));
      selectedRoots.add(root.uid); result.push([root.uid, { collection: c, mode: s.mode }]);
    }
    return result;
  }
  for (const node of nodes.values()) if (node.resource.kind === 'theme') selections(node, node.resource.selections);
  for (const unit of units) {
    const groups = new Set();
    function organization(entries) {
      for (const entry of entries) {
        if (entry.resource) address({ unit }, entry);
        else {
          if (groups.has(entry.id)) fail('ORGANIZATION_DUPLICATE', `Duplicate organizational group ${entry.id}`, { file: unit.file });
          groups.add(entry.id); organization(entry.children);
        }
      }
    }
    organization(unit.document.organization);
  }

  // Conservatively inspect every authored branch before any selected-mode evaluation.
  const edges = new Map([...nodes.keys()].map(k => [k, new Set()]));
  function inspect(from, expression, isVariable = false, owner = from, wholeValue = true) {
    if (expression.ref) {
      const target = address(from, expression.ref, ['value', 'variable', 'style', 'preset']);
      if (isVariable && wholeValue && !expression.ref.pointer && target.resource.kind === 'variable' && owner.resource.dataType !== target.resource.dataType) fail('TYPE_MISMATCH', 'A direct native variable alias must retain the same native variable type', details(from));
      edges.get(owner.uid).add(target.uid);
      selections(from, expression.ref.modes);
    } else if (expression.bind) {
      if (isVariable) fail('BINDING_INVALID', 'Variable values use ref aliases, not property bindings', details(from));
      const target = address(from, asAddress(expression.bind), ['variable']);
      edges.get(owner.uid).add(target.uid);
    } else if (expression.record) for (const child of Object.values(expression.record)) inspect(from, child, isVariable, owner, false);
    else if (expression.list) for (const child of expression.list) inspect(from, child, isVariable, owner, false);
    else if (expression.color) {
      inspect(from, expression.color.base, isVariable, owner, false);
      inspect(from, expression.color.alpha, isVariable, owner, false);
    }
  }
  for (const node of nodes.values()) {
    const r = node.resource;
    if (r.expression) inspect(node, r.expression);
    for (const expression of Object.values(r.values ?? {})) inspect(node, expression, true);
    if (r.kind === 'collection') for (const entry of r.overrides ?? []) {
      const variable = address(node, entry.variable);
      for (const expression of Object.values(entry.values)) inspect(node, expression, true, variable);
    }
  }
  const finished = new Set(), active = new Set();
  function acyclic(uid) {
    if (active.has(uid)) fail('CYCLE', 'Resource reference graph contains a cycle in an authored branch', details(nodes.get(uid)));
    if (finished.has(uid)) return;
    active.add(uid); for (const next of edges.get(uid)) acyclic(next);
    active.delete(uid); finished.add(uid);
  }
  for (const uid of nodes.keys()) acyclic(uid);

  const rootCollections = collections.filter(n => !parent.has(n.uid));
  const defaults = new Map(rootCollections.map(c => [c.uid, { collection: c, mode: c.resource.defaultMode }]));
  function apply(context, from, list) {
    const result = new Map(context);
    for (const [root, selected] of selections(from, list)) result.set(root, selected);
    return result;
  }
  function contextFor({ themes = [], modes = [] } = {}) {
    let result = new Map(defaults);
    for (const theme of themes) {
      const node = address({ unit: root }, typeof theme === 'string' ? { resource: theme } : theme, ['theme']);
      result = apply(result, node, node.resource.selections);
    }
    return apply(result, { unit: root }, modes);
  }
  function traceContext(context) {
    return [...context.values()].map(({ collection: c, mode }) => ({ package: c.unit.document.package.id, collection: c.id, mode }));
  }
  function selectedVariable(node, context) {
    const owner = variableCollections.get(node.uid);
    let { collection, mode } = context.get(owner.uid);
    while (collection.uid !== owner.uid) {
      const replacement = overrides.get(collection.uid)?.get(node.uid);
      if (replacement && own(replacement, mode)) return { expression: replacement[mode], from: collection };
      mode = collection.resource.modeMap[mode]; collection = parent.get(collection.uid);
    }
    return { expression: node.resource.values[mode], from: node };
  }
  function evaluate(node, context, stack = new Set()) {
    if (stack.has(node.uid)) fail('CYCLE', 'Reference cycle during resolution', details(node));
    const nextStack = new Set([...stack, node.uid]);
    const picked = node.resource.kind === 'variable' ? selectedVariable(node, context) : { expression: node.resource.expression, from: node };
    const result = expression(picked.from, picked.expression, context, nextStack);
    checkValue(typeOf(node.resource), result.value, { ...details(node), context: traceContext(context) });
    result.references = validateResolved(node, result.value, typeOf(node.resource), result.bindings, result.references);
    return result;
  }
  function expression(from, expr, context, stack) {
    if (own(expr, 'literal')) return { value: structuredClone(expr.literal), bindings: [], references: [] };
    if (expr.ref) {
      const selected = apply(context, from, expr.ref.modes);
      const target = address(from, expr.ref, ['value', 'variable', 'style', 'preset']);
      let result = evaluate(target, selected, stack);
      if (expr.ref.pointer !== undefined && expr.ref.pointer !== '') {
        const pointer = expr.ref.pointer;
        let value = result.value;
        for (const raw of pointer.slice(1).split('/')) {
          const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
          if (value === null || typeof value !== 'object' || !own(value, key) || (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))) fail('POINTER_MISSING', `Reference pointer does not exist: ${pointer}`, details(from));
          value = value[key];
        }
        const slice = list => list.filter(b => b.pointer === pointer || b.pointer.startsWith(pointer + '/')).map(b => ({ ...b, pointer: b.pointer.slice(pointer.length) }));
        result = { value, bindings: slice(result.bindings), references: slice(result.references) };
      }
      for (const binding of result.bindings) {
        const root = variableCollections.get(binding.variable).uid;
        if (selected.get(root)?.collection.uid !== context.get(root)?.collection.uid || selected.get(root)?.mode !== context.get(root)?.mode) fail('BINDING_CONTEXT', 'A reference-local mode override cannot pin a live binding to a different consumer context', details(from));
      }
      return result;
    }
    if (expr.bind) {
      const target = address(from, asAddress(expr.bind), ['variable']);
      const resolved = evaluate(target, context, stack);
      return { value: resolved.value, bindings: [{ pointer: '', variable: target.uid, dataType: target.resource.dataType }], references: [] };
    }
    if (expr.color) {
      const base = expression(from, expr.color.base, context, stack);
      const alpha = expression(from, expr.color.alpha, context, stack);
      checkValue('color', base.value, details(from)); checkValue('number', alpha.value, details(from));
      if (base.bindings.length || alpha.bindings.length) fail('BINDING_INVALID', 'Color composition uses ref relationships, not destination bindings', details(from));
      const factor = alpha.value / (expr.color.alphaUnit === 'percent' ? 100 : 1);
      if (factor < 0 || factor > 1) fail('VALUE_INVALID', 'Color composition alpha must be in [0,1] or [0,100] for the declared unit', details(from));
      return { value: { ...base.value, alpha: expr.color.operation === 'replace' ? factor : base.value.alpha * factor }, bindings: [], references: [] };
    }
    const children = expr.list ? expr.list.map((v, i) => [i, v]) : Object.entries(expr.record);
    const entries = [], bindings = [], references = [];
    for (const [key, child] of children) {
      const result = expression(from, child, context, stack);
      entries.push([key, result.value]);
      bindings.push(...result.bindings.map(b => ({ ...b, pointer: `/${escapePointer(key)}${b.pointer}` })));
      references.push(...result.references.map(b => ({ ...b, pointer: `/${escapePointer(key)}${b.pointer}` })));
    }
    return { value: expr.list ? entries.map(([, v]) => v) : Object.fromEntries(entries), bindings, references };
  }

  function validateResolved(node, value, dataType, bindings, inheritedReferences = []) {
    const references = [];
    for (const binding of bindings) {
      const p = binding.pointer;
      let expected;
      const get = parts => parts.reduce((v, k) => v?.[k], value);
      const parts = p.slice(1).split('/').map(s => s.replaceAll('~1', '/').replaceAll('~0', '~'));
      const field = parts.at(-1), owner = get(parts.slice(0, -1));
      if (field === 'color' && (owner?.type === 'SOLID' || ['DROP_SHADOW', 'INNER_SHADOW'].includes(owner?.type) || (own(owner ?? {}, 'position') && own(owner ?? {}, 'itemId')))) expected = 'color';
      if (['radius', 'spread'].includes(field) && ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'].includes(owner?.type)) expected = 'number';
      if (['x', 'y'].includes(field) && parts.at(-2) === 'offset' && ['DROP_SHADOW', 'INNER_SHADOW'].includes(get(parts.slice(0, -2))?.type)) expected = 'number';
      if (['sectionSize', 'count', 'offset', 'gutterSize'].includes(field) && ['ROWS', 'COLUMNS', 'GRID'].includes(owner?.pattern)) expected = 'number';
      if (['textStyle', 'textProperties'].includes(dataType)) {
        if (['/fontSize', '/fontWeight', '/paragraphSpacing', '/paragraphIndent', '/letterSpacing/value', '/lineHeight/value'].includes(p)) expected = 'number';
        if (['/fontName/family', '/fontName/style'].includes(p)) expected = 'string';
      }
      if (dataType === 'layoutProperties' && /^\/(?:padding(?:Left|Right|Top|Bottom)|itemSpacing|counterAxisSpacing|gridRowGap|gridColumnGap|minWidth|maxWidth|minHeight|maxHeight)$/.test(p)) expected = 'number';
      if (dataType === 'corners' && /^\/(?:cornerRadius|topLeftRadius|topRightRadius|bottomLeftRadius|bottomRightRadius)$/.test(p)) expected = 'number';
      if (dataType === 'stroke' && /^\/stroke(?:Weight|TopWeight|RightWeight|BottomWeight|LeftWeight)$/.test(p)) expected = 'number';
      if (dataType === 'motionStyle' || dataType === 'motionProperties') {
        if (/\/props\/[^/]+$/.test(p)) expected = binding.dataType;
      }
      // Dynamic shader properties explicitly support variable aliases.
      const propertyIndex = parts.findIndex(p => ['properties', 'propertyMetadata'].includes(p));
      if (propertyIndex >= 0 && get(parts.slice(0, propertyIndex))?.type === 'SHADER') expected = binding.dataType;
      if (!expected || binding.dataType !== expected) fail('BINDING_INVALID', `Variable binding is not valid at ${p || '/'} in ${dataType}`, details(node));
    }
    function walk(value, pointer = '') {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        const ids = new Set();
        for (let i = 0; i < value.length; i++) {
          const child = value[i];
          if (child?.itemId) {
            if (ids.has(child.itemId)) fail('ITEM_DUPLICATE', 'Stack item identities must be unique within their array', details(node, pointer));
            ids.add(child.itemId);
          }
          walk(child, `${pointer}/${i}`);
        }
        return;
      }
      if (value.asset) {
        const preserved = inheritedReferences.find(a => a.pointer === `${pointer}/asset`);
        const asset = preserved ? nodes.get(preserved.resource) : address(node, value.asset, ['asset']);
        references.push({ pointer: `${pointer}/asset`, resource: asset.uid, kind: 'asset' });
        const media = asset.resource.mediaType;
        const valid = ['IMAGE', 'EMOJI'].includes(value.type) ? media.startsWith('image/') : value.type === 'VIDEO' ? media.startsWith('video/') : value.type === 'SHADER' ? media === 'application/vnd.figma.shader' : value.type === 'PATTERN' ? ['image/svg+xml', 'application/vnd.ffs.vector+json'].includes(media) : value.type === 'FIGMA' ? media === 'application/vnd.figma.animation-style' : own(value, 'family') && own(value, 'style') ? media.startsWith('font/') : true;
        if (!valid) fail('ASSET_TYPE', `Asset media type does not match ${value.type}`, details(node, pointer));
      }
      if (value.gifAsset) {
        const preserved = inheritedReferences.find(a => a.pointer === `${pointer}/gifAsset`);
        const asset = preserved ? nodes.get(preserved.resource) : address(node, value.gifAsset, ['asset']);
        references.push({ pointer: `${pointer}/gifAsset`, resource: asset.uid, kind: 'asset' });
        if (asset.resource.mediaType !== 'image/gif') fail('ASSET_TYPE', 'gifAsset must address an image/gif asset', details(node, pointer));
      }
      if (value.fillStyle) {
        const preserved = inheritedReferences.find(a => a.pointer === `${pointer}/fillStyle`);
        const style = preserved ? nodes.get(preserved.resource) : address(node, value.fillStyle, ['style']);
        if (style.resource.family !== 'paint') fail('REFERENCE_KIND', 'Vector fillStyle must reference a paint style', details(node, pointer));
        references.push({ pointer: `${pointer}/fillStyle`, resource: style.uid, kind: 'style' });
      }
      for (const [count, sizes] of [['gridRowCount', 'gridRowSizes'], ['gridColumnCount', 'gridColumnSizes']]) if (value[count] !== undefined && value[sizes] && value[count] !== value[sizes].length) fail('VALUE_INVALID', `${sizes} must match ${count}`, details(node, pointer));
      if (['FLEX', 'FIXED'].includes(value.type) && (value.value === undefined || value.value < 0 || (value.type === 'FLEX' && value.value === 0))) fail('VALUE_INVALID', 'Fixed/flexible grid tracks require an appropriate nonnegative/positive size', details(node, pointer));
      if (value.type === 'CUSTOM_CUBIC_BEZIER' && !value.easingFunctionCubicBezier) fail('VALUE_INVALID', 'Custom bezier easing requires control points', details(node, pointer));
      if (value.type === 'CUSTOM_SPRING' && !value.easingFunctionSpring) fail('VALUE_INVALID', 'Custom spring easing requires spring parameters', details(node, pointer));
      if (value.vertices && value.segments) {
        for (const segment of value.segments) for (const key of ['start', 'end']) if (!Number.isInteger(segment[key]) || segment[key] < 0 || segment[key] >= value.vertices.length) fail('VALUE_INVALID', 'Vector segment references an invalid vertex index', details(node, pointer));
        for (const region of value.regions ?? []) for (const loop of region.loops) for (const segment of loop) if (!Number.isInteger(segment) || segment < 0 || segment >= value.segments.length) fail('VALUE_INVALID', 'Vector region references an invalid segment index', details(node, pointer));
      }
      if (value.gradientStops) {
        if (value.gradientStops.length < 2 || value.gradientStops.some((s, i, a) => s.position < 0 || s.position > 1 || (i && s.position < a[i - 1].position))) fail('VALUE_INVALID', 'Gradient stops must be ordered positions in [0,1] with at least two stops', details(node, pointer));
      }
      if (value.pattern === 'STRETCH' || value.alignment === 'STRETCH') {
        if (value.pattern !== 'GRID' && value.sectionSize !== undefined) fail('VALUE_INVALID', 'Stretch grid does not declare a fixed section size', details(node, pointer));
      }
      for (const [key, child] of Object.entries(value)) walk(child, `${pointer}/${escapePointer(key)}`);
    }
    walk(value);
    return references;
  }

  function allContexts() {
    let result = [new Map()];
    for (const c of rootCollections) {
      const options = collections.filter(n => roots.get(n.uid).uid === c.uid).flatMap(n => Object.keys(n.resource.modes).map(mode => ({ collection: n, mode })));
      if (result.length * options.length > maxContexts) fail('CONTEXT_LIMIT', `Validation needs more than ${maxContexts} contexts; raise maxContexts for this package`, { file: root.file });
      result = result.flatMap(context => options.map(choice => new Map([...context, [c.uid, choice]])));
    }
    return result;
  }
  function validateAll() {
    const contexts = allContexts();
    for (const context of contexts) for (const node of nodes.values()) {
      if (valueKinds.has(node.resource.kind)) {
        const result = evaluate(node, context);
        for (const link of result.references) edges.get(node.uid).add(link.resource);
      }
      if (artwork.has(node.uid)) for (const link of validateResolved(node, artwork.get(node.uid), 'vectorArtwork', [])) edges.get(node.uid).add(link.resource);
    }
    active.clear(); finished.clear();
    for (const uid of nodes.keys()) acyclic(uid);
    return { contextCount: contexts.length, resourceCount: nodes.size };
  }
  function resolve(options = {}) {
    const context = contextFor(options);
    const resources = {};
    for (const node of nodes.values()) if (node.unit === root && valueKinds.has(node.resource.kind)) {
      const result = evaluate(node, context);
      Object.defineProperty(resources, node.id, { enumerable: true, value: { dataType: typeOf(node.resource), ...result } });
    }
    return { format: 'figma-foundations-resolved', formatVersion: '0.1.0', package: root.document.package, context: traceContext(context), resources };
  }
  return { validateAll, resolve, checkContext: contextFor };
}
