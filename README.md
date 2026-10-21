# Figma Foundations Schema

An MIT-licensed JSON format and reference toolkit for reusable Figma Design foundations.

Define colors, variables, styles, grids, effects, typography, motion, and assets with stable identities and explicit relationships. Validate the definitions and resolve the values for a chosen theme without losing the authored references and native bindings.

**Status: 0.1.0 developer preview.** For design-system engineers, plugin authors, and tooling developers. This is an independent project, not an official Figma standard or a Figma plugin. Live Figma import/export and visual equivalence have not been verified.

## Quick start

Use Node.js 22 or newer. CI checks Node 22 and 24 on Linux.

```sh
git clone https://github.com/iamjdimitrov/figma-foundations-schema.git
cd figma-foundations-schema
npm ci
node src/cli.js validate examples/minimal.foundation.json
node src/cli.js resolve examples/surface.foundation.json --theme theme-dark
```

Validation returns a JSON report and exits with status 0 on success. The resolver returns concrete values together with native binding and dependency-reference records. Neither command requires a Figma account or access token. External provider assets are recorded as dependencies and are not downloaded.

You can also extract a release archive and run the same commands from its directory. Distribution is through GitHub initially; no public npm package is claimed.

## A small definition

The complete file in [examples/minimal.foundation.json](examples/minimal.foundation.json) contains:

```json
{
  "format": "figma-foundations",
  "formatVersion": "0.1.0",
  "package": { "id": "hello-foundations", "name": "Hello Foundations", "version": "1.0.0" },
  "dependencies": {},
  "resources": {
    "brand-blue": {
      "kind": "value",
      "name": "Brand blue",
      "dataType": "color",
      "expression": { "literal": { "space": "srgb", "channels": [0.1, 0.3, 0.9], "alpha": 1 } }
    }
  },
  "organization": [],
  "sources": {}
}
```

The resource ID `brand-blue` is independent of its display name. More involved packages use explicit `ref` relationships, `bind` expressions for native property bindings, collections and modes, themes, and integrity-checked assets.

## What it provides

- Versioned JSON Schemas and a written specification.
- Separate value, variable, collection, style, preset, theme, and asset resources.
- A local validator that checks structure, relationships, types, binding positions, cycles, asset integrity, and every collection/mode combination within its declared work budget.
- A theme resolver, a split-file assembler, and a JavaScript API.
- Examples, conformance fixtures, source mappings, and a reproducible release bundle.

## Documentation

- [Current specification](spec/0.1.0.md)
- [Usage and setup](docs/usage.md)
- [Complete resolved-field reference](docs/fields.md)
- [Machine-readable schemas](schemas/0.1.0)
- [Worked JSON example](examples/surface.foundation.json)
- [Coverage catalog](examples/catalog.foundation.json)
- [Conformance fixtures](conformance/manifest.json)
- [Baseline and scope](docs/coverage.md)
- [Design decisions and sources](docs/design-decisions.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Release process](docs/releasing.md)

The central design is an ID-addressed resource graph. Variables, collections, styles, reusable values, presets, themes, and assets are distinct resources. Organization and display names do not determine identity or reference resolution.

FFS defines its own data model and resolution semantics. Native field vocabulary is derived from Figma's public API typings with [MIT attribution](docs/THIRD_PARTY_NOTICES.txt).

The implementation checks the documented Figma foundation baseline. Components, screens, prototype navigation, and per-node timelines are outside its scope. Font/provider availability, visual rendering, and reconstruction by a Figma integration require separate verification. The format may evolve before 1.0; published versioned contracts will be retained.

## License

The project's original schemas, specification, documentation, examples, and implementation are available under the [MIT License](LICENSE). Commercial use is permitted under its terms.

Third-party material retains its applicable license and attribution requirements. See [third-party notices](docs/THIRD_PARTY_NOTICES.txt).
