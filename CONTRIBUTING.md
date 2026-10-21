# Contributing

Bug reports, documentation improvements, real foundation examples, and implementation contributions are welcome. FFS is an MIT-licensed developer preview; proposals can change before 1.0.

## Development

Use Node.js 22 or 24, clone the repository, and run:

```sh
npm ci
npm run verify
```

The verification command runs behavioral tests, conformance fixtures, generated-file checks, and local documentation-link checks. CI checks Node 22 and 24 on Linux. Local checks on other platforms are useful but do not establish every platform's compatibility.

## Make a change

1. Start with a small issue describing the problem, especially for format changes.
2. Add an example or regression test describing the intended behavior independently of the implementation.
3. Update implementation and specification together. Do not make naming or organization alter identity implicitly.
4. Run `npm run build` for schema/contract changes. Run `node tools/build-examples.js` if generated examples or fixtures change.
5. Run `npm run verify`, review the generated diff, and submit a pull request explaining compatibility.

Do not edit generated schemas, `docs/fields.md`, or the baseline inventory without changing their source. `tools/native-contract.ts` selects the public Figma data surface; `tools/build-schemas.js` defines FFS mappings and the authored contract. `test/` includes manually authored behavioral tests; the conformance catalog alone is not sufficient evidence of correctness.

Versioned schemas become immutable after public release. A change to their meaning or accepted data requires a new format version, updated fixtures, documented migration, and new schema files. During the initial unpublished preview, fixes are collected into 0.1.0; after publication, do not rewrite that release.

## Dependencies and Figma coverage

Dependencies are pinned with a lockfile. Updating Figma's typings can change schemas even when the generator is unchanged. Review the official API changes, baseline inventory, coverage ledger, required fields, and enums before accepting such an update. Automated dependency PRs do not authorize silent changes to a released contract.

Examples must be synthetic or shared with permission. Do not commit private file keys, access tokens, proprietary assets, or personal data. Preserve third-party notices. Report security issues using [SECURITY.md](SECURITY.md).

## License

Contributions are submitted under the project's [MIT License](LICENSE), unless an explicit different arrangement has been agreed before submission. Third-party material must have compatible permissions and retain its required attribution.

## Maintainer releases

See [the release process](docs/releasing.md). npm publication is intentionally disabled; GitHub source/schema releases are the initial distribution channel.
