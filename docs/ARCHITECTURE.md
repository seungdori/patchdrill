# Architecture

PatchDrill is split into deterministic modules:

| Module | Responsibility |
| --- | --- |
| `src/baseline.ts` | Compares current reports with previous JSON baselines and computes risk deltas. |
| `src/codeowners.ts` | Reads GitHub CODEOWNERS files and annotates changed files with owners. |
| `src/command-plan.ts` | Normalizes verification command plans, deduplicates matching commands, and preserves required-command strength when policy and detectors overlap. |
| `src/git.ts` | Reads changed files from git ranges, staged changes, unstaged changes, and untracked files. |
| `src/policy.ts` | Loads `.patchdrill.yml/json`, filters ignored paths, and merges repo-specific commands/rules. |
| `src/project.ts` | Discovers ecosystem signals, nested project roots, package managers, task runners, solution filters, Xcode containers, and workspace dependency graphs from manifests. |
| `src/dependency.ts` | Extracts package.json, pyproject.toml, requirements.txt, NuGet PackageReference/PackageVersion, Maven pom.xml, Gradle build files and version catalogs, Gemfile, composer.json, go.mod, Cargo.toml, npm, pnpm, Yarn, Bun, Go, Cargo, Poetry, uv, Pipfile, Bundler, and Composer dependency additions, removals, and version updates through a parser/diff analyzer registry. |
| `src/doctor.ts` | Renders first-run repository readiness diagnostics without mutating the repository or running verification commands. |
| `src/markdown-links.ts` | Checks public README, docs, and example Markdown local links so launch documentation cannot drift silently. |
| `src/package-scripts.ts` | Extracts package.json script additions, removals, and updates so risk scoring can distinguish dependency intent from executable package automation changes. |
| `src/evidence.ts` | Renders and verifies Proof Pack evidence manifests with tool version, report metadata, artifact, and command-output digests. |
| `src/planner.ts` | Turns changed files, workspace package impact, project signals, nested package scopes, and platform metadata into a verification command plan through ecosystem planner handlers. |
| `src/risk.ts` | Scores the patch and emits explainable findings, including missing required verification evidence, dependency proof gaps, and whole-workflow GitHub Actions trust-boundary checks. |
| `src/runner.ts` | Executes required commands when `--run` is set and optional commands when `--run-optional` is also set. |
| `src/verification.ts` | Joins verification plans with command results into passed, failed, timed-out, not-run, skipped-optional, and unplanned execution states. |
| `src/release-readiness.ts` | Performs local static release-readiness checks for npm package metadata, action wiring, provenance workflow settings, public release docs, demo artifact synchronization, and local Markdown links. |
| `src/report-contract.ts` | Verifies JSON report self-consistency, including summary counts derived from changed files, command plans, and command results. |
| `src/report.ts` | Renders Markdown summaries, evaluates fail thresholds, and keeps the public report-renderer re-export surface stable. |
| `src/report-annotations.ts` | Renders escaped GitHub Actions annotation commands from findings. |
| `src/report-html.ts` | Renders the self-contained Proof Pack HTML dashboard and run-trend view. |
| `src/report-sarif.ts` | Renders SARIF 2.1.0 output and stable finding fingerprints for GitHub code scanning. |
| `src/schema.ts` | Exposes embedded JSON Schemas for policy, report, evidence, doctor, and release-check contracts. |
| `src/scan.ts` | Orchestrates the scan pipeline. |
| `src/stack-coverage.ts` | Defines the public fixture-backed stack coverage matrix used by launch docs and tests. |
| `src/cli.ts` | Parses arguments and handles user output. |

## Pipeline

```text
git diff -> changed files + added lines -> policy filters -> CODEOWNERS hints
                       |                                      |
                       v                                      v
       project signals + affected packages -> verification command plan
                       |
                       v
     dependency diff + package automation enrichment
                                      |
                                      v
                           opt-in command runner
                                      |
                                      v
     command plan + command results -> verification status matrix
                                      |
                                      v
                         risk assessment -> baseline comparison
                                      |
                                      v
                   Proof Pack: Markdown / JSON / SARIF / HTML / evidence
                                      |
                                      v
             fail-on severity + max-risk + max-risk-delta gate
```

## Extension Seams

- Dependency formats register a name, matcher, parser, diff function, and empty snapshot in `src/dependency.ts`, so adding a manifest or lockfile format does not grow the scan orchestrator and can be reflected in coverage docs.
- Verification command adapters add plans through `src/command-plan.ts`, so duplicate detector and policy commands are normalized before running or scoring evidence gaps.
- Report contract checks live in `src/report-contract.ts`, so evidence verification can reject a JSON report whose summary counts no longer match its payload.
- Project and workspace detection lives in `src/project.ts`; command planning consumes those signals through the handler registry in `src/planner.ts`.
- Risk scoring stays explainable: every score increase in `src/risk.ts` must produce a human-readable finding and a stable rule ID documented in [RULE_CATALOG.md](RULE_CATALOG.md).

## Non-Goals

- Replacing human code review.
- Calling an LLM by default.
- Running destructive commands.
- Becoming a full SAST, SCA, or test selection platform.

PatchDrill should stay useful as the small, deterministic layer before those heavier tools.

## Security Posture

The repository also includes CI, CodeQL, OpenSSF Scorecard, Dependabot, and package dry-run verification. See [SECURITY_POSTURE.md](SECURITY_POSTURE.md).
