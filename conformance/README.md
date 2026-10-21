# Conformance fixtures

`manifest.json` lists authored-document fixtures with expected validity and, for invalid documents, the first semantic/structural error code. Paths are relative to the manifest.

Run `npm run check`. The harness loads valid packages through the file loader and checks invalid authored documents through the in-memory semantic API. For example, the intentionally missing-dependency case reports `DEPENDENCY_MISSING`; an actual file loader may fail earlier while trying to locate the missing file. The loader may also reject structurally invalid envelopes before returning a loaded package. File loading, dependency hashes, resource assembly, and path checks have separate behavioral tests in `test/`.

To implement an independent consumer:

1. Validate the authored grammar against the versioned package schema.
2. Resolve and check every relationship and collection/mode combination.
3. Validate concrete values against the versioned value definitions.
4. Match fixture validity and stable error codes. Error prose need not match.

The behavioral suite also tests output values, binding retention, reference-origin identity, theme precedence, cross-package collection overrides, integrity, and cycles in bounded artwork. Run `npm test` for that suite.

`tools/build-examples.js` generates the static negative fixtures and the full coverage catalog from explicit examples. It does not generate the validator implementation.
