# Launch Playbook

PatchDrill is designed for developers who already use AI coding agents and want a concrete, repeatable answer to "what proves this patch?"

## Positioning

One-liner:

> PatchDrill is the deterministic proof layer between code review and CI for AI-generated and human patches.

Short pitch:

> AI agents can write code quickly, but reviewers still need evidence. PatchDrill reads a git diff, infers what should be tested, flags risky areas, and writes a portable Proof Pack for local review, CI, audit trails, and model-assisted review.

Comparison:

- AI PR reviewers judge whether a patch looks right.
- Traditional CI runs commands that were already configured.
- SAST/SCA scanners match known code, dependency, and vulnerability rules.
- Review automation posts configured comments and annotations.
- PatchDrill turns the patch itself into a repeatable verification plan, risk report, policy gate, and Proof Pack.

## Launch Checklist

Done for the public repository:

- Public GitHub repository with CodeQL, OpenSSF Scorecard, Dependabot, issue forms, pull request template, and repository topics.
- Self-contained GitHub Action that builds from the checked-out action source before running PatchDrill.
- Proof Pack outputs: SARIF, Markdown, JSON, compact PR summary, static HTML dashboard, and verifiable evidence manifest.
- Generated PR workflow runs inferred required commands with a per-command timeout.
- README terminal demo asset showing the risk summary and portable report outputs.
- Package automation script findings for install-time hooks, removed verification scripts, no-op checks, and remote shell pipes.
- First-party fixtures for more than five popular stacks, including Node/Turborepo, Python, Rails, Terraform, Docker/Compose, Kubernetes, Java/Gradle, .NET, SwiftPM, Xcode, Bazel, Buck2, Pants, Cargo, and Go.
- Example report and release provenance documentation.
- `patchdrill doctor` for first-run repository readiness diagnosis.
- `patchdrill release-check` for static npm/GitHub Action release readiness checks.
- CI and release workflows dogfood `patchdrill release-check --format json`.
- CI/action/release workflows verify generated evidence manifests before artifacts or packages are trusted; release smoke includes required command evidence.
- JSON Schemas for policy, report, evidence, doctor, and release-check automation contracts.
- Public case-study and stack-coverage docs for launch evaluation.
- Release readiness checks local Markdown links across README, docs, and examples.
- Release readiness checks package file allowlisting and launch-discovery keywords.

Still needed for launch distribution:

- Publish npm package as `patchdrill`.
- Move the `v0` GitHub Action tag after each compatible 0.x action update.
- Dogfood on 20 external real pull requests and add anonymized example reports.
- Submit to GitHub Trending-adjacent communities: Hacker News Show HN, r/programming, r/ClaudeCode, r/codex, r/opensource, DevTools directories.
- Write a blog post: "AI made patches faster. Here is how to make review evidence faster too."

## Demo Script

```bash
git checkout -b demo/auth-change
echo "// pretend auth change" >> src/auth/session.ts
patchdrill scan
patchdrill scan --run \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
patchdrill verify --evidence patchdrill-evidence.json
```

Show:

- High-impact auth finding.
- Missing test-change finding.
- Inferred commands from `package.json`.
- Package script findings when a patch changes install hooks or weakens test scripts.
- Proof Pack artifact bundle.
- SARIF upload in GitHub code scanning.
- `.patchdrill.yml` policy rule that requires owner review for a sensitive path.

## Release Gate

Run this before creating the first public release:

```bash
patchdrill doctor
patchdrill release-check
patchdrill release-check --format json
npm run check
node dist/cli.js scan --evidence .patchdrill/release-evidence.json --summary-markdown .patchdrill/release-summary.md --markdown .patchdrill/release.md --json .patchdrill/release.json --sarif .patchdrill/release.sarif --html .patchdrill/release-dashboard.html --run --fail-on critical
node dist/cli.js verify --evidence .patchdrill/release-evidence.json
npm pack --dry-run
```

`release-check` verifies local repository readiness, including parseable shipped JSON Schemas, matching README/SCHEMAS documentation for every public schema command, command-backed evidence verification in CI/action/release workflows, README and pull request Proof Pack command checklists, synchronized stack-coverage docs, stack fixture contracts, and committed demo artifact synchronization. npm Trusted Publisher configuration still has to be checked in npm account settings.

## Star Hooks

- "No LLM required."
- "Proof Packs over vibes."
- "Not another AI reviewer. A deterministic safety gate."
- "Works before your CI bill grows."
- "Review the plan before running commands."
- "Markdown for humans, JSON for bots, SARIF for GitHub."
- "Detects prompt-injection strings before agents ingest them."
- "Catches install-time package scripts and no-op test rewrites."
