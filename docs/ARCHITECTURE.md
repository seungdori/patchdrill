# Architecture

PatchDrill is split into deterministic modules:

| Module | Responsibility |
| --- | --- |
| `src/git.ts` | Reads changed files from git ranges, staged changes, unstaged changes, and untracked files. |
| `src/policy.ts` | Loads `.patchdrill.yml/json`, filters ignored paths, and merges repo-specific commands/rules. |
| `src/project.ts` | Discovers ecosystem signals from manifests. |
| `src/planner.ts` | Turns changed files, workspace package impact, and project signals into a verification command plan. |
| `src/risk.ts` | Scores the patch and emits explainable findings. |
| `src/runner.ts` | Executes required commands when `--run` is set. |
| `src/report.ts` | Renders Markdown, SARIF, and evaluates fail thresholds. |
| `src/scan.ts` | Orchestrates the scan pipeline. |
| `src/cli.ts` | Parses arguments and handles user output. |

## Pipeline

```text
git diff -> changed files + added lines -> policy filters
                       |                  |
                       v                  v
       project signals + affected packages -> verification command plan
                                      |
                                      v
                           optional command runner
                                      |
                                      v
                    risk assessment -> Markdown / JSON / SARIF
                                      |
                                      v
                       fail-on severity + max-risk gate
```

## Non-Goals

- Replacing human code review.
- Calling an LLM by default.
- Running destructive commands.
- Becoming a full SAST, SCA, or test selection platform.

PatchDrill should stay useful as the small, deterministic layer before those heavier tools.

## Security Posture

The repository also includes CI, CodeQL, OpenSSF Scorecard, Dependabot, and package dry-run verification. See [SECURITY_POSTURE.md](SECURITY_POSTURE.md).
