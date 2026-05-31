# Roadmap

## Near Term

- Monorepo package targeting for npm workspaces, pnpm, Turborepo, Nx, Cargo workspaces, Go modules, and Pants.
- Dependency diff enrichment for lockfiles.
- PR comment mode.
- First-party fixtures for the top 20 open-source stacks.
- Organization policy packs for regulated teams.

## Later

- Language-aware changed-test matching.
- Optional MCP server for coding agents.
- Optional LLM summarization that can only summarize deterministic findings.
- Web dashboard that reads JSON artifacts from CI.
- Rule confidence calibration from anonymized fixture corpora.

## Completed In 0.1.x

- SARIF output for GitHub code scanning.
- Policy file support: `.patchdrill.yml`.
- Added-line scanning for secret-looking values.
- Prompt-injection detection for agent-visible files.

## Contribution Targets

PatchDrill needs real-world fixtures from:

- Rails.
- Django/FastAPI.
- Next.js.
- Rust workspaces.
- Go services.
- Terraform-heavy infra repos.
- Mobile apps.
