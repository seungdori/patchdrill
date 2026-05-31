# Release

PatchDrill is configured for npm trusted publishing and provenance through `.github/workflows/release.yml`.

## npm Trusted Publishing

Configure the npm package as a trusted publisher for this repository and the `Release` workflow. npm trusted publishing uses OIDC from GitHub Actions and automatically produces provenance attestations when publishing from the trusted workflow.

## Release Flow

1. Update `package.json` version and `CHANGELOG.md`.
2. Run local verification:

```bash
npm run check
npm pack --dry-run
node dist/cli.js scan --run --markdown .patchdrill/release.md --json .patchdrill/release.json --sarif .patchdrill/release.sarif
```

3. Create a GitHub Release for the version tag.
4. The `Release` workflow runs build, tests, package dry-run, and `npm publish --provenance`.

## Dry Run

Use `workflow_dispatch` to run release checks without publishing. Publishing is limited to GitHub Release events.
