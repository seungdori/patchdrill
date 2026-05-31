# Changelog

## 0.1.0

- Initial CLI with diff scanning, project detection, risk findings, verification planning, optional command execution, Markdown reports, JSON reports, and GitHub workflow generation.
- Added `.patchdrill.yml` policy-as-code support.
- Added SARIF output for GitHub code scanning.
- Added diff-content detection for secret-looking values and prompt-injection instructions.
- Added agent-control, MCP configuration, GitHub Actions privilege, and destructive agent-instruction rules.
- Added SARIF partial fingerprints, CodeQL, OpenSSF Scorecard, and Dependabot configuration.
- Split CI gating into explicit `--fail-on` severity and `--max-risk` score thresholds.
