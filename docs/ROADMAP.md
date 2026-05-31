# Roadmap

## Near Term

- Dependency diff enrichment for Cargo, Go, Python, pnpm, Yarn, and Bun lockfiles.
- First-party fixtures for the top 20 open-source stacks.
- Organization policy packs for regulated teams.
- Native affected-task integration for Turborepo, Nx, Cargo workspaces, Go modules, and Pants.

## Later

- Language-aware changed-test matching.
- Optional MCP server for coding agents.
- Optional LLM summarization that can only summarize deterministic findings.
- Web dashboard that reads JSON artifacts from CI.
- Rule confidence calibration from anonymized fixture corpora.
- Local TUI for interactively accepting or rejecting inferred verification commands.

## Completed In 0.1.x

- SARIF output for GitHub code scanning.
- Policy file support: `.patchdrill.yml`.
- Added-line scanning for secret-looking values.
- Prompt-injection detection for agent-visible files.
- Agent-control and MCP configuration risk rules.
- SARIF partial fingerprints for stable GitHub code scanning alerts.
- CodeQL, OpenSSF Scorecard, and Dependabot repository posture.
- Direct Node workspace package targeting.
- npm trusted publishing and provenance release workflow.
- package.json dependency diff summaries.
- Pull request comment upsert mode for the GitHub Action.
- JSON Schemas for policy and report contracts.
- Workspace dependency graph expansion for downstream package testing.
- npm `package-lock.json` dependency diff summaries.
- CODEOWNERS owner hints for changed files.
- Baseline comparison against previous JSON reports.
- `--max-risk-delta` gating for baseline regressions.
- `patchdrill init --policy` starter policy generation.

## Contribution Targets

PatchDrill needs real-world fixtures from:

- Rails.
- Django/FastAPI.
- Next.js.
- Rust workspaces.
- Go services.
- Terraform-heavy infra repos.
- Mobile apps.
