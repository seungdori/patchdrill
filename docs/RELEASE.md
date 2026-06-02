# Release

PatchDrill is configured for npm trusted publishing and provenance through `.github/workflows/release.yml`.

## npm Trusted Publishing

Configure the npm package as a trusted publisher for this repository and the `Release` workflow. npm trusted publishing uses OIDC from GitHub Actions and automatically produces provenance attestations when publishing from the trusted workflow.

## Release Flow

1. Update `package.json` version and `CHANGELOG.md`.
2. Run local verification:

```bash
patchdrill doctor
patchdrill release-check
patchdrill release-check --format json
patchdrill schema doctor
patchdrill schema release-check
npm run check
node dist/cli.js scan --evidence .patchdrill/release-evidence.json --summary-markdown .patchdrill/release-summary.md --markdown .patchdrill/release.md --json .patchdrill/release.json --sarif .patchdrill/release.sarif --html .patchdrill/release-dashboard.html --run --fail-on critical
node dist/cli.js verify --evidence .patchdrill/release-evidence.json
npm pack --dry-run
```

3. Create a GitHub Release for the version tag.
4. The `Release` workflow runs build, tests, package dry-run, and `npm publish --provenance`.

## Dry Run

Use `workflow_dispatch` to run release checks without publishing. Publishing is limited to GitHub Release events.

`patchdrill release-check` is intentionally local and static. It verifies package metadata, package file allowlisting, launch keywords, action wiring, command-backed evidence verification in CI/action/release workflows, release workflow provenance settings, README install paths, repository release files, README and pull request Proof Pack command checklists, parseable shipped JSON Schemas with matching README/SCHEMAS documentation, synchronized stack-coverage docs, stack fixture contracts, and local Markdown links across README, docs, and examples. It cannot verify the npm account-side Trusted Publisher setup; check that in npm before publishing.

CI and the release workflow both run `patchdrill release-check --format json` after `npm run check` so launch-readiness regressions fail before package publishing.
