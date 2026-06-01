# Architecture

PatchDrill is split into deterministic modules:

| Module | Responsibility |
| --- | --- |
| `src/baseline.ts` | Compares current reports with previous JSON baselines and computes risk deltas. |
| `src/codeowners.ts` | Reads GitHub CODEOWNERS files and annotates changed files with owners. |
| `src/git.ts` | Reads changed files from git ranges, staged changes, unstaged changes, and untracked files. |
| `src/policy.ts` | Loads `.patchdrill.yml/json`, filters ignored paths, and merges repo-specific commands/rules. |
| `src/project.ts` | Discovers ecosystem signals, package managers, task runners, solution filters, and workspace dependency graphs from manifests. |
| `src/dependency.ts` | Extracts package.json, requirements.txt, NuGet PackageReference/PackageVersion, npm, pnpm, Yarn, Bun, Go, Cargo, Poetry, Pipfile, Bundler, and Composer dependency additions, removals, and version updates. |
| `src/planner.ts` | Turns changed files, workspace package impact, project signals, and platform metadata into a verification command plan. |
| `src/risk.ts` | Scores the patch and emits explainable findings, including whole-workflow GitHub Actions trust-boundary checks. |
| `src/runner.ts` | Executes required commands when `--run` is set. |
| `src/report.ts` | Renders Markdown, SARIF, and evaluates fail thresholds. |
| `src/schema.ts` | Exposes embedded JSON Schemas for policy and report contracts. |
| `src/scan.ts` | Orchestrates the scan pipeline. |
| `src/cli.ts` | Parses arguments and handles user output. |

## Pipeline

```text
git diff -> changed files + added lines -> policy filters -> CODEOWNERS hints
                       |                                      |
                       v                                      v
       project signals + affected packages -> verification command plan
                       |
                       v
              dependency diff enrichment
                                      |
                                      v
                           optional command runner
                                      |
                                      v
                    risk assessment -> baseline comparison
                                      |
                                      v
                          Markdown / JSON / SARIF
                                      |
                                      v
             fail-on severity + max-risk + max-risk-delta gate
```

## Non-Goals

- Replacing human code review.
- Calling an LLM by default.
- Running destructive commands.
- Becoming a full SAST, SCA, or test selection platform.

PatchDrill should stay useful as the small, deterministic layer before those heavier tools.

## Security Posture

The repository also includes CI, CodeQL, OpenSSF Scorecard, Dependabot, and package dry-run verification. See [SECURITY_POSTURE.md](SECURITY_POSTURE.md).
