# Security policy

FFS is a developer preview. Only the latest preview receives fixes; published format files remain versioned. There is no guaranteed support or response-time commitment.

## Report a vulnerability

Use the repository's **Security → Report a vulnerability** feature for a private report. If private reporting is unavailable, open a public issue requesting a private reporting channel without including exploit details, private inputs, or credentials. Maintainers should enable private vulnerability reporting before the first public release.

Include the affected version, a minimal synthetic example, impact, and reproduction steps. Do not include real organization data or private Figma assets unless a secure sharing method has been agreed.

## Trust boundaries

The CLI reads local package, dependency, manifest, and asset files. Paths are constrained to their owning package directory, including symlink checks. Asset and dependency digests are checked; the tool does not fetch external provider content or execute serialized expressions as code.

Validation is not a rendering sandbox, a malware scanner, or a guarantee that an external shader/font/provider is safe or available. Use resource and filesystem isolation when embedding validation in a service accepting hostile files. The context budget limits mode combinations, not the total memory or CPU consumed by arbitrary large/deep documents.

GitHub workflows use pinned actions and read-only permissions for checks. Only the tag-triggered release job receives permission to publish release assets. No registry token is needed for the initial distribution.
