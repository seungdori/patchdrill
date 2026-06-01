# Roadmap

## Near Term

- Expand first-party fixtures toward the full top 20 open-source stacks.
- Expand native affected-task integrations beyond Turborepo, Nx, Pants, Cargo, Go, Bazel, and Buck workspaces.

## Later

- Expand language-aware changed-test matching with framework-specific conventions.
- Expand the static dashboard into a multi-run trend view for CI artifact history.
- Optional MCP server for coding agents.
- Optional LLM summarization that can only summarize deterministic findings.
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
- `pnpm-lock.yaml` dependency diff summaries.
- `yarn.lock` dependency diff summaries.
- `go.sum` dependency diff summaries.
- `Cargo.lock` dependency diff summaries.
- `requirements.txt` dependency diff summaries.
- `poetry.lock` dependency diff summaries.
- `Pipfile.lock` dependency diff summaries.
- `bun.lock` dependency diff summaries.
- `Gemfile.lock` dependency diff summaries.
- `composer.lock` dependency diff summaries.
- CODEOWNERS owner hints for changed files.
- Baseline comparison against previous JSON reports.
- `--max-risk-delta` gating for baseline regressions.
- `patchdrill init --policy` starter policy generation.
- npm package metadata for repository discovery.
- Architecture docs and action examples for the public package path.
- CI dogfooding with PatchDrill SARIF and report artifacts.
- Current-format example report covering Markdown sections.
- GitHub issue forms and pull request template for contributor intake.
- `schemaVersion` in JSON and Markdown reports.
- Native Turborepo and Nx task-runner plans for affected Node workspaces.
- Binary `bun.lockb` migration guidance for legacy Bun projects.
- Organization policy packs for regulated and agentic-code teams.
- Cargo workspace task plans for affected crates and downstream dependents.
- Go workspace task plans for affected modules and downstream dependents.
- First-party stack fixture harness covering Node/Turborepo, Next.js, Python, Rails, PHP/Composer, Terraform, Pants, Cargo, and Go services.
- Native Pants changed-target task plans.
- Language-aware source-to-test matching for risk scoring.
- Static HTML dashboard generation from scan output and saved JSON reports.
- Composite GitHub Action support for HTML dashboard artifacts.
- Kubernetes and Helm manifest verification planning.
- First-party stack fixtures for Kustomize, Java/Gradle, and .NET services.
- Bazel and Buck2 workspace detection with graph-wide verification planning.
- Swift Package Manager verification planning.
- Django framework detection with `manage.py test` and `manage.py check` planning.
- Spring Boot framework detection with Gradle `bootJar` packaging plans.
- Android Gradle detection with debug unit test, assemble, and lint planning.
- ASP.NET Core detection with .NET build and publish planning.
- FastAPI app entrypoint detection with import-smoke planning.
- GitHub Actions supply-chain findings for unpinned actions, remote script pipes, and untrusted PR metadata interpolation.

## Contribution Targets

PatchDrill needs real-world fixtures from:

- Workflow context-aware hardening for `pull_request_target` checkout patterns.
- FastAPI route-level changed-test targeting.
- .NET solution and test-project targeting.
- Android variant-aware task narrowing.
- Bazel/Buck changed-target narrowing beyond graph-wide defaults.
- Mobile apps.
- Xcode scheme-aware iOS and macOS app test planning.
