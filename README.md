# PatchDrill

PatchDrill is a local-first CI drill for proving that AI-generated and human patches are safe before merge.

AI coding agents made code cheap. Trust is still expensive. PatchDrill turns a git diff into a concrete verification plan, runs the required checks when asked, and emits a Markdown/JSON evidence report that reviewers can inspect.

```bash
npx patchdrill scan --base origin/main --run \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --fail-on high
```

## Why Star It

- Works with the tools you already have: git, npm, pnpm, yarn, bun, pytest, cargo, go, Maven, Gradle, dotnet, Terraform, Docker.
- No LLM required. The core is deterministic, offline, and reviewable.
- Built for AI-era PRs: highlights auth, billing, migrations, secrets, CI, infra, lockfiles, large diffs, and missing test changes.
- Useful locally and in CI. The same command prints a reviewer-friendly report and can fail a pull request.
- Emits portable evidence: Markdown for humans, JSON for bots and dashboards.

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
  --json patchdrill-report.json
```

Add a GitHub Actions workflow:

```bash
patchdrill init
```

## CLI

```text
patchdrill scan [options]
patchdrill init [--force]
patchdrill explain
```

Options:

| Option | Description |
| --- | --- |
| `--base <ref>` | Compare against a base ref, for example `origin/main`. |
| `--head <ref>` | Head ref when using `--base`, default `HEAD`. |
| `--run` | Execute required inferred verification commands. |
| `--markdown <path>` | Write a Markdown report. |
| `--json <path>` | Write a JSON report. |
| `--fail-on <level>` | Fail when findings meet severity: `info`, `low`, `medium`, `high`, `critical`. |
| `--quiet` | Only use exit code. |

## Supported Signals

PatchDrill detects project shape from repo manifests:

| Ecosystem | Signals | Typical commands |
| --- | --- | --- |
| Node | `package.json`, lockfiles, scripts | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` |
| Python | `pyproject.toml`, `requirements.txt`, `setup.py` | `python -m pytest`, `python -m compileall .` |
| Rust | `Cargo.toml` | `cargo test --all-targets`, `cargo clippy --all-targets -- -D warnings` |
| Go | `go.mod` | `go test ./...`, `go vet ./...` |
| Java/Kotlin | `pom.xml`, `build.gradle`, wrappers | `mvn test`, `./mvnw test`, `./gradlew test` |
| .NET | `global.json`, project files | `dotnet test` |
| Terraform | `*.tf`, `*.tfvars` | `terraform fmt -check && terraform validate` |
| Docker | `Dockerfile`, Compose files | `docker build .` |
| GitHub Actions | `.github/workflows/*` | workflow diff review |

## Risk Model

PatchDrill scores a patch from 0 to 100. Higher is riskier.

The current deterministic rules look for:

- Secret-bearing files such as `.env` and private keys.
- High-impact paths: auth, billing, sessions, migrations, security, crypto, permissions.
- Infra and release behavior: Docker, Terraform, Kubernetes, GitHub Actions.
- Dependency lockfile changes.
- Source changes without test changes.
- Large line deltas and binary files.
- Failed verification commands.

The risk model is intentionally explainable. Every score increase is represented as a finding in the report.

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
      - run: npx patchdrill scan --base origin/${{ github.base_ref }} --markdown patchdrill-report.md --json patchdrill-report.json --fail-on high
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: patchdrill-report
          path: |
            patchdrill-report.md
            patchdrill-report.json
```

## Example Report

See [examples/report.md](examples/report.md).

## Design Principles

- Deterministic first. No model call is required to get a useful answer.
- Evidence over vibes. A reviewer should see the exact commands and findings.
- Local by default. Source code stays in your checkout.
- Conservative scoring. PatchDrill would rather ask for proof than silently bless a risky patch.
- Extensible later. The rule engine is small enough for contributors to add ecosystems and policies.

## Roadmap

- SARIF output for GitHub code scanning.
- PR comment mode.
- Policy file support for organization-specific path rules.
- Monorepo package targeting.
- Language-aware test selection.
- Dependency diff enrichment for npm, Cargo, Go, and Python lockfiles.
- Optional LLM summary mode that never replaces deterministic findings.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions are new ecosystem detectors, risk rules, and real-world report fixtures.

## Security

PatchDrill executes commands only when you pass `--run`. It runs inferred required commands in your repository shell, so review the verification plan first when scanning untrusted repos. See [SECURITY.md](SECURITY.md).

## License

MIT
