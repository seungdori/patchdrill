# PatchDrill Case Studies

This directory points launch readers at concrete Proof Pack scenarios.

## Included

| Case | Evidence | What to inspect |
| --- | --- | --- |
| Risky agent PR | `../risky-agent-pr` | Critical workflow boundary, secret-looking value, package lifecycle script, PR summary, SARIF, HTML |
| Review-ready PR | `../demo` | Normal Proof Pack output with Markdown, JSON, SARIF, HTML, and compact summary |

## Suggested Demo Flow

```bash
patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
open patchdrill-risky-demo/patchdrill-demo.html
cat patchdrill-risky-demo/patchdrill-demo-summary.md
```

The point is not that PatchDrill replaces review. The point is that every reviewer receives the same deterministic evidence bundle before deciding whether the patch is acceptable.
