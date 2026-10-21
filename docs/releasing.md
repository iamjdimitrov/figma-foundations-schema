# Release process

## Prepare

1. Update the package version, changelog, and versioned specification/schemas together. Never change an already published contract in place.
2. Write `docs/releases/<version>.md` with scope, compatibility, validation evidence, and actual limitations.
3. Run `npm ci` followed by `npm run verify` from a clean checkout on supported Node versions.
4. Run `npm run release:bundle`. It creates a deterministic archive, a file manifest, and `SHA256SUMS` under ignored `dist/`.
5. Extract the archive into a temporary directory, install its locked dependencies, and run the documented quick start.

The archive uses an explicit source allowlist. It includes the tools and lockfile needed to reproduce schemas; it excludes `.git`, installed dependencies, logs, local operating-system files, and `dist/`. Tar timestamps and ownership are normalized for reproducibility.

## Publish on GitHub

Enable private vulnerability reporting in the repository's security settings. Review CI results, then create an annotated tag matching `package.json`, such as `v0.1.0`, and push that tag.

The tag workflow independently verifies on Node 22 and 24 before publishing a GitHub prerelease with the archive, source-file manifest, checksums, and version-specific notes. It verifies the tag matches the package version. No npm publication occurs, and `private: true` remains deliberate.

If the workflow fails, fix the issue and use a new release version after any public distribution. Do not move a public release tag to different content or replace its schema contract silently.

## Verify downloads

Use a SHA-256 utility to compare downloaded files with `SHA256SUMS`. On macOS:

```sh
shasum -a 256 -c SHA256SUMS
```

On Linux:

```sh
sha256sum -c SHA256SUMS
```

Checksums detect mismatched bytes; they are not cryptographic signatures from a separately verified signing identity.
