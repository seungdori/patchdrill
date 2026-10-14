# Security Posture

PatchDrill is meant to be installed in CI and sometimes executed locally against sensitive diffs. The repository should therefore carry the same trust signals it asks users to expect from their own projects.

## Automated Checks

| Check | File | Purpose |
| --- | --- | --- |
| TypeScript build and Vitest | `.github/workflows/ci.yml` | Verifies deterministic scanner behavior and package readiness. |
| PatchDrill self-scan | `.github/workflows/ci.yml` | Dogfoods pull request diff scanning, verifies evidence hashes, uploads SARIF, and preserves Markdown/JSON/HTML/evidence report artifacts. |
| CodeQL | `.github/workflows/codeql.yml` | Adds GitHub-native static analysis for the TypeScript codebase. |
| OpenSSF Scorecard | `.github/workflows/scorecard.yml` | Tracks open-source security posture and uploads SARIF results. |
| Dependabot | `.github/dependabot.yml` | Keeps npm and GitHub Actions dependencies current. |
| Release provenance | `.github/workflows/release.yml` | Publishes through npm trusted publishing and provenance. |
| Hardened Action inputs | `action.yml` | Passes composite Action inputs through step environment variables and a bash array so optional paths and thresholds are not re-tokenized by the shell. |
| MCP safety contract | `src/mcp.ts`, `docs/MCP.md` | Keeps MCP scans read-only by default, constrains generated artifact paths to repository-relative locations, and requires explicit `allowCommandExecution: true` before repository commands can run. |

## Repository Rules To Enable On GitHub

- Require pull request review before merging to `main`.
- Require status checks: CI, CodeQL, OpenSSF Scorecard.
- Require signed commits or vigilant mode if the maintainers use it consistently.
- Restrict GitHub Actions permissions to least privilege by default.
- Enable private vulnerability reporting.
- Enable secret scanning and push protection where available.

## Release Hygiene

- Run `npm pack --dry-run` before publishing.
- Review the tarball file list before every release.
- Publish from GitHub Actions trusted publishing with provenance.
- Keep generated reports out of git through `.gitignore`.
- Avoid storing any real secret-like fixture in tests; synthesize test values at runtime.
- Keep MCP integrations local and explicit: start the server from the repository being reviewed, avoid broad `PATCHDRILL_MCP_ALLOW_ANY_CWD=1` use, and verify generated evidence manifests before trusting agent-authored summaries.
