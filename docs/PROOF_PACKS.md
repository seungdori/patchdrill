# Proof Packs

A Proof Pack is the reviewable evidence bundle PatchDrill generates for one patch. It is designed to be small enough for pull request review, structured enough for bots, and verifiable enough for audit trails.

PatchDrill does not replace reviewer judgment. It gives reviewers the same deterministic evidence every time the same diff is scanned.

## Contents

| Artifact | Audience | Use |
| --- | --- | --- |
| Compact Markdown summary | Pull request reviewers | Shows status, risk, top findings, and required commands in a short comment or step summary. |
| Full Markdown report | Human reviewers | Provides changed files, command plan, findings, dependency changes, package script changes, and command results. |
| JSON report | Bots and dashboards | Preserves the complete report contract for policy gates and custom tooling. |
| SARIF report | GitHub code scanning | Turns findings into code scanning alerts with stable fingerprints. |
| HTML dashboard | Humans and CI artifacts | Gives a self-contained visual report, including optional trend history from prior JSON reports. |
| Evidence manifest | CI and audit trails | Records the PatchDrill version, report metadata, artifact digests, command metadata, and command-output digests so the bundle can be verified later. |

## Review Flow

1. Run `patchdrill scan --base origin/main` locally to see the plan without running commands.
2. Run `patchdrill scan --base origin/main --run` when the inferred required commands look right.
3. Attach or upload the Proof Pack artifacts in CI.
4. Review the findings and failed commands before asking an AI reviewer or human reviewer for higher-level judgment.
5. Verify the evidence manifest if artifacts are post-processed or audited later.

## CI Flow

```bash
patchdrill scan --base origin/main --run \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html \
  --fail-on high \
  --max-risk 69

patchdrill verify --evidence patchdrill-evidence.json
```

This keeps the scanner deterministic and local-first while still producing artifacts that CI gates, auditors, bots, and reviewers can inspect.

## Why It Matters

AI PR reviewers are useful for judgment, explanation, and design feedback. They are not a durable source of proof. A Proof Pack gives that judgment layer concrete input:

- The exact files and lines that changed.
- The ecosystems and workspace scopes touched by the patch.
- The commands PatchDrill inferred from the patch.
- Which required commands ran, failed, timed out, or still lack evidence.
- Which optional commands were skipped unless `--run-optional` was used.
- Which risk rules increased the score.
- Which artifacts belonged to the same scan.
- Which PatchDrill version, report metadata, and command-output digests produced the evidence bundle.

The intended workflow is not "trust PatchDrill instead of reviewers." It is "make the proof explicit before reviewers spend attention."
