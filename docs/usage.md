# Use the schema and validator

Requires Node.js 22 or newer. From the repository directory:

```sh
npm ci
npm run verify
```

Validate a package, including all collection/mode combinations:

```sh
npm run validate -- examples/catalog.foundation.json
```

Resolve a theme:

```sh
npm run resolve -- examples/surface.foundation.json --theme theme-dark
```

The direct CLI emits JSON without npm's script header:

```sh
node src/cli.js validate examples/catalog.foundation.json
node src/cli.js resolve examples/catalog.foundation.json --theme theme-brand
```

Exit status is 0 for success, 1 for invalid content or file errors, and 2 for invalid command arguments. Error codes are stable; prose may improve. Validation stops at the first failure. `--theme` applies only to `resolve`; use `--help` and `--version` for command information.

## JavaScript API

```js
import { loadPackage, validate, resolve } from './src/index.js';

const input = loadPackage('examples/catalog.foundation.json');
const report = validate(input);
if (!report.valid) console.error(report.errors);
else {
  const output = resolve(input, { themes: ['theme-brand'] });
  console.log(output.resources['surface-color']);
}
```

`validate(document)` and `resolve(document)` also accept an in-memory authored document when no file/dependency context is needed. Use `loadPackage` for local files, asset integrity, dependencies, and fragment source locations. The loader performs file/dependency checks before semantic validation and can throw `FoundationsError`. `validate` returns its semantic/structural error report; `resolve` throws on failure.

`resolve` performs full validation before resolving the requested context. It preserves native bindings separately from computed values and does not mutate the input. Theme IDs are root-local strings or dependency-qualified addresses. An explicit caller selection is:

```js
resolve(input, {
  themes: ['theme-light'],
  modes: [{ collection: { resource: 'brand' }, mode: 'brand-night' }],
  maxContexts: 16384
});
```

`maxContexts` is a positive safe integer specifying an implementation work budget. Hitting it returns `CONTEXT_LIMIT`, never a partial success. Invalid options return `ARGUMENT_INVALID`. The CLI supports `--max-contexts 16384`. It does not impose a Figma plan limit.

## Multiple source files

Use `format: "figma-foundations-manifest"`, keep the package's other metadata, and replace the resource dictionary with resource-file paths:

```json
"resources": ["src/colors.json", "src/styles.json"]
```

Each resource file contains an ID-to-resource dictionary. Run:

```sh
node src/cli.js assemble foundations.manifest.json --output foundations.foundation.json
```

The output is validated and the destination must not already exist. Keep the assembled package beside its referenced relative asset/dependency files, or bundle them at matching paths.

## Schema consumers

Editors can use `package.schema.json` for resource shape completion. Full consumers must also implement semantic validation and use `values.schema.json` on evaluated values. A literal payload is intentionally validated in the second stage; a green editor check alone does not prove valid references or a valid concrete effect.

The serialized file's `formatVersion` is authoritative. The schema uses URN `$id` identifiers so no owned public domain or hosted schema service is implied.

## Maintain the baseline

`npm run build` regenerates versioned schemas, the native-field inventory, the field reference, and third-party attribution from pinned dependencies. It does not contact Figma. `node tools/build-examples.js` regenerates the coverage catalog and static negative fixtures.

Review field changes before upgrading `@figma/plugin-typings`. Do not silently regenerate an already distributed version with changed contracts; create a new format version. The generated definitions follow the public Figma typings under their MIT license. No DTCG schemas or specification prose are included in the implementation.

Use `npm run check:generated` to detect stale generated artifacts and `npm run check:docs` for local links. `npm run release:bundle` creates the downloadable source/schema bundle and checksums in ignored `dist/`. See [the release process](releasing.md).
