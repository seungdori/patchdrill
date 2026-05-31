# Changelog

## 0.1.0

- Initial CLI with diff scanning, project detection, risk findings, verification planning, optional command execution, Markdown reports, JSON reports, and GitHub workflow generation.
- Added `.patchdrill.yml` policy-as-code support.
- Added SARIF output for GitHub code scanning.
- Added diff-content detection for secret-looking values and prompt-injection instructions.
- Added agent-control, MCP configuration, GitHub Actions privilege, and destructive agent-instruction rules.
- Added SARIF partial fingerprints, CodeQL, OpenSSF Scorecard, and Dependabot configuration.
- Split CI gating into explicit `--fail-on` severity and `--max-risk` score thresholds.
- Added Node workspace affected-package targeting and release workflow for npm provenance.
- Added package.json dependency diff summaries to Markdown and JSON reports.
- Added pull request comment upsert mode to the GitHub Action and generated workflow.
- Added JSON Schemas for policy and report contracts with `patchdrill schema`.
- Added downstream workspace dependency graph expansion for Node monorepos.
- Added npm `package-lock.json` dependency diff summaries.
