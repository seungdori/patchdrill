# PatchDrill

PatchDrill is a local-first CI drill for proving that AI-generated and human patches are safe before merge.

AI coding agents made code cheap. Trust is still expensive. PatchDrill turns a git diff into a concrete verification plan, runs the required checks when asked, and emits Markdown, JSON, and SARIF evidence that reviewers and CI systems can inspect.

```bash
npx patchdrill scan --base origin/main --run \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html \
  --fail-on high \
  --max-risk 69
```

## Why Star It

- Works with the tools you already have: git, npm, pnpm, yarn, bun, pytest, Django, FastAPI, cargo, Go, Maven, Gradle, Spring Boot, Android Gradle, dotnet, ASP.NET Core, Swift, Terraform, Docker, Kubernetes, Helm, Bazel, and Buck2.
- No LLM required. The core is deterministic, offline, and reviewable.
- Built for AI-era PRs: highlights auth, billing, migrations, secrets, CI, workflow supply-chain and trust-boundary risk, infra, lockfiles, large diffs, prompt-injection content, and missing test changes.
- Useful locally and in CI. The same command prints a reviewer-friendly report and can fail a pull request.
- Emits portable evidence: Markdown for humans, JSON for bots, SARIF for GitHub code scanning, and a self-contained HTML dashboard.
- Supports policy-as-code through `.patchdrill.yml`, including default, regulated, and agentic starter packs.
- Ships with serious open-source security posture: CodeQL, OpenSSF Scorecard, Dependabot, strict tests, and package dry-run verification.
- Understands Node, Cargo, Go, and Pants workspaces, plus Turborepo and Nx, targeting changed packages plus downstream dependents instead of blindly running only root-level commands.
- Includes first-party stack fixtures for Node/Turborepo, Next.js, Python, Django, FastAPI, Rails, PHP/Composer, Terraform, Kubernetes/Helm/Kustomize, Java/Gradle, Spring Boot, Android Gradle, .NET, ASP.NET Core, SwiftPM, Bazel, Buck2, Pants, Cargo, and Go repository shapes.
- Explains package.json, requirements.txt, NuGet PackageReference and central PackageVersion files, npm package-lock, pnpm-lock, yarn.lock, bun.lock, go.sum, Cargo.lock, poetry.lock, Pipfile.lock, Gemfile.lock, and composer.lock dependency additions, removals, and version updates instead of only saying "lockfile changed."
- Adds CODEOWNERS owner hints to changed files so reviewers can see the responsible teams.

## What It Does

PatchDrill answers four questions every reviewer asks:

1. What changed?
2. Which parts of the stack are touched?
3. What should be run to prove this patch?
4. What risk remains after the drill?

Example summary:

```text
PatchDrill WARN - risk 42/100, confidence 58/100
Changed files: 4, +121/-18
Required commands: 3
Added lines inspected: 121
Top findings:
- [high] High-impact product area changed (src/auth/session.ts)
- [medium] Source changed without test changes
Run with --run to execute required verification commands.
```

## Install

Use it without installing:

```bash
npx patchdrill scan --base origin/main
```

Or install globally:

```bash
npm install -g patchdrill
patchdrill scan --base origin/main
```

## Quickstart

Analyze uncommitted work:

```bash
patchdrill scan
```

Analyze a branch against `main`:

```bash
patchdrill scan --base origin/main
```

Run the inferred required commands:

```bash
patchdrill scan --base origin/main --run
```

Write reports:

```bash
patchdrill scan --base origin/main \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
```

Create a static dashboard from a saved JSON report:

```bash
patchdrill dashboard --json patchdrill-report.json --output patchdrill-dashboard.html
```

Use the GitHub Action with PR comments:

```yaml
- uses: patchdrill/patchdrill@v0
  with:
    base: origin/${{ github.base_ref }}
    pr-comment: "true"
```

Use policy-as-code:

```bash
patchdrill scan --config .patchdrill.yml
```

Export JSON Schemas for editors and bots:

```bash
patchdrill schema policy > patchdrill-policy.schema.json
patchdrill schema report > patchdrill-report.schema.json
```

Compare against a previous report:

```bash
patchdrill scan --baseline previous-patchdrill-report.json --max-risk-delta 0 --json patchdrill-report.json
```

Add a GitHub Actions workflow:

```bash
patchdrill init
```

Add a workflow and starter policy:

```bash
patchdrill init --policy
```

Use a stricter starter policy pack:

```bash
patchdrill init --policy-pack regulated
```

## CLI

```text
patchdrill scan [options]
patchdrill dashboard --json <report.json> [--output <dashboard.html>]
patchdrill init [--force] [--policy] [--policy-pack <name>]
patchdrill explain
patchdrill schema [policy|report] [--output <path>]
```

Options:

| Option | Description |
| --- | --- |
| `--base <ref>` | Compare against a base ref, for example `origin/main`. |
| `--head <ref>` | Head ref when using `--base`, default `HEAD`. |
| `--config <path>` | Read policy from `.patchdrill.yml/json` or a specific path. |
| `--baseline <path>` | Compare against a previous PatchDrill JSON report. |
| `--run` | Execute required inferred verification commands. |
| `--markdown <path>` | Write a Markdown report. |
| `--json <path>` | Write a JSON report. |
| `--sarif <path>` | Write a SARIF report for GitHub code scanning. |
| `--html <path>` | Write a self-contained static HTML dashboard. |
| `--fail-on <level>` | Fail when findings meet severity: `info`, `low`, `medium`, `high`, `critical`. |
| `--max-risk <score>` | Fail when risk score is above a 0-100 threshold, default `69`. |
| `--max-risk-delta <score>` | Fail when baseline risk increase is above a 0-100 threshold. |
| `--max-output-chars <n>` | Keep the last `n` characters from each command output stream, default `20000`. |
| `--command-timeout-ms <n>` | Stop each verification command after `n` milliseconds. |
| `--quiet` | Only use exit code. |
| `--policy` | Create `.patchdrill.yml` when used with `patchdrill init`. |
| `--policy-pack <name>` | Starter policy pack for `patchdrill init`: `default`, `regulated`, `agentic`. |
| `--list` | List available schemas when used with `patchdrill schema`. |
| `--output <path>` | Write a schema or dashboard to a file. |

## Supported Signals

PatchDrill detects project shape from repo manifests:

| Ecosystem | Signals | Typical commands |
| --- | --- | --- |
| Node | `package.json`, lockfiles, scripts | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` |
| Python | `pyproject.toml`, `requirements.txt`, `setup.py`, `manage.py`, `FastAPI()` | `python -m pytest tests/test_module.py`, `python -m pytest`, `python manage.py test`, `python -m compileall .`, FastAPI import smoke |
| Rust | `Cargo.toml`, Cargo workspaces | `cargo test --all-targets`, `cargo test -p crate --all-targets`, `cargo clippy -p crate --all-targets -- -D warnings` |
| Go | `go.mod`, `go.work` | `go test ./...`, `go test ./module/...`, `go vet ./module/...` |
| Java/Kotlin | `pom.xml`, `build.gradle`, wrappers | `mvn test`, `gradle test`, `./gradlew test`, `./gradlew bootJar` |
| Android | `com.android.application`, `com.android.library`, `AndroidManifest.xml`, variant source sets | `./gradlew testDebugUnitTest`, `./gradlew testReleaseUnitTest`, `./gradlew testFreeDebugUnitTest`, `./gradlew assemble<Variant>`, `./gradlew lint<Variant>` |
| .NET | `global.json`, `.slnf`, `.sln`, `.csproj`, `ProjectReference` | `dotnet test App.slnf`, `dotnet test tests/Api.Tests/Api.Tests.csproj`, `dotnet build src/Api/Api.csproj --no-restore`, `dotnet publish src/Api/Api.csproj --no-restore` |
| Swift | `Package.swift`, `Package.resolved`, `*.swift` | `swift test`, `swift build` |
| Terraform | `*.tf`, `*.tfvars` | `terraform fmt -check && terraform validate` |
| Docker | `Dockerfile`, Compose files | `docker build .` |
| Kubernetes | `Chart.yaml`, `kustomization.yaml`, `k8s/`, `kubernetes/`, `manifests/` | `helm lint .`, `kubectl kustomize .`, `kubectl apply --dry-run=client -f k8s` |
| Bazel | `MODULE.bazel`, `WORKSPACE`, `BUILD.bazel`, `.bazelrc` | `bazel test //path/...`, `bazel build //path/...`, graph-wide fallback for root metadata |
| Buck2 | `.buckconfig`, `BUCK`, `BUCK.v2` | `buck2 test //path/...`, `buck2 build //path/...`, graph-wide fallback for root metadata |
| Pants | `pants.toml` | `pants --changed-since=HEAD --changed-dependents=transitive test` |
| GitHub Actions | `.github/workflows/*` | workflow diff review |

For Node workspaces, PatchDrill detects `package.json` workspaces and `pnpm-workspace.yaml`, then emits package-scoped commands such as `pnpm --filter @acme/api run test` or `npm --workspace @acme/api run build` for directly changed packages and downstream dependents. When `turbo.json` or `nx.json` is present, it plans native task-runner commands such as `pnpm exec turbo run test --filter=@acme/api` or `npx nx run api:test`. See [docs/MONOREPOS.md](docs/MONOREPOS.md).

For Cargo workspaces, PatchDrill reads `[workspace].members`, crate names, and workspace-internal dependencies, then emits `cargo test -p crate --all-targets` and optional `cargo clippy -p crate --all-targets -- -D warnings` for changed crates and downstream dependent crates.

For Go workspaces, PatchDrill reads `go.work` `use` entries, module names, and workspace-internal `require` dependencies, then emits `go test ./module/...` and optional `go vet ./module/...` for changed modules and downstream dependent modules.

For Pants repositories, PatchDrill uses Pants' native Git-aware changed target selection with `--changed-since` and `--changed-dependents=transitive`, so Pants keeps ownership of target graph expansion across languages.

## Risk Model

PatchDrill scores a patch from 0 to 100. Higher is riskier.

The current deterministic rules look for:

- Secret-bearing files such as `.env` and private keys.
- Secret-looking values added inside the diff, including private keys and common token formats.
- Prompt-injection instructions added to agent-visible files such as `AGENTS.md`, issue templates, and Markdown docs.
- High-impact paths: auth, billing, sessions, migrations, security, crypto, permissions.
- Infra and release behavior: Docker, Terraform, Kubernetes, GitHub Actions.
- Workflow supply-chain risk: broad token writes, `pull_request_target`, inherited secrets, mutable reusable workflows receiving inherited secrets, unpinned actions, remote script pipes, untrusted PR metadata interpolation, and privileged PR-head checkout combinations.
- Dependency manifest and lockfile changes.
- package.json, requirements.txt, NuGet PackageReference and central PackageVersion files, npm package-lock, pnpm-lock, yarn.lock, bun.lock, go.sum, Cargo.lock, poetry.lock, Pipfile.lock, Gemfile.lock, and composer.lock dependency additions, removals, and updates.
- Legacy binary `bun.lockb` changes with guidance to migrate toward the text `bun.lock` format.
- Source changes without nearby or mirrored matching test changes.
- Large line deltas and binary files.
- Failed verification commands.
- Custom policy rules from `.patchdrill.yml`.

The risk model is intentionally explainable. Every score increase is represented as a finding in the report.

## Policy-As-Code

PatchDrill reads `.patchdrill.yml`, `.patchdrill.yaml`, or `.patchdrill.json` from the repository root.

```yaml
failOn: high
maxRisk: 69

ignoredPaths:
  - generated/**

requiredCommands:
  - id: contract-tests
    command: npm run test:contracts
    reason: API surfaces changed.

rules:
  - id: payments-owner-review
    title: Payments owner review required
    severity: critical
    path: src/payments/**
```

See [docs/POLICY.md](docs/POLICY.md).

## GitHub Actions

Generate a workflow:

```bash
patchdrill init
```

Or add it manually:

```yaml
name: PatchDrill

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  patchdrill:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx patchdrill scan --base origin/${{ github.base_ref }} --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --html patchdrill-dashboard.html --fail-on high --max-risk 69
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: patchdrill.sarif
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: patchdrill-report
          path: |
            patchdrill-report.md
            patchdrill-report.json
            patchdrill-dashboard.html
            patchdrill.sarif
```

## Example Report

See [examples/report.md](examples/report.md).
For code scanning integration, see [docs/SARIF.md](docs/SARIF.md).
For repository security posture, see [docs/SECURITY_POSTURE.md](docs/SECURITY_POSTURE.md).
For pull request comments, see [docs/PR_COMMENTS.md](docs/PR_COMMENTS.md).
For static HTML dashboards, see [docs/DASHBOARD.md](docs/DASHBOARD.md).
For machine-readable schemas, see [docs/SCHEMAS.md](docs/SCHEMAS.md).
For owner hints, see [docs/CODEOWNERS.md](docs/CODEOWNERS.md).
For risk deltas, see [docs/BASELINES.md](docs/BASELINES.md).

## Release Provenance

PatchDrill includes a release workflow for npm trusted publishing and provenance. Configure the package as a trusted publisher in npm, then publish from a GitHub Release. See [docs/RELEASE.md](docs/RELEASE.md).

## Dependency Review

PatchDrill summarizes dependency changes from changed `package.json`, `requirements.txt`, NuGet `PackageReference` / `PackageVersion` manifests, npm `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `go.sum`, `Cargo.lock`, `poetry.lock`, `Pipfile.lock`, `Gemfile.lock`, and `composer.lock` files, listing the package, dependency section or lockfile path, change type, previous version, and new version in Markdown and JSON reports. This complements heavier SCA tools by making reviewer-visible dependency intent explicit.

## Design Principles

- Deterministic first. No model call is required to get a useful answer.
- Evidence over vibes. A reviewer should see the exact commands and findings.
- Local by default. Source code stays in your checkout.
- Conservative scoring. PatchDrill would rather ask for proof than silently bless a risky patch.
- Extensible later. The rule engine is small enough for contributors to add ecosystems and policies.
- Trustworthy distribution. CI verifies build, tests, SARIF generation, and npm package contents.

## Roadmap

- Broader first-party fixture coverage for common open-source stacks.
- More native affected-task integrations beyond Turborepo, Nx, Pants, Cargo, and Go workspaces.
- Multi-run static dashboard trends for CI artifact history.
- Local TUI for interactively accepting or rejecting inferred verification commands.
- Optional LLM summary mode that never replaces deterministic findings.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions are new ecosystem detectors, risk rules, and real-world report fixtures.

## Security

PatchDrill executes commands only when you pass `--run`. It runs inferred required commands in your repository shell, so review the verification plan first when scanning untrusted repos. See [SECURITY.md](SECURITY.md).

## License

MIT
