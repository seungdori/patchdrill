# PatchDrill Summary

**FAIL** - risk 94/100, confidence 21/100

- Changed files: 8 (+326 / -78)
- Verification plan: 4 required, 1 optional
- Command results: 3 run, 1 failed
- Baseline risk delta: +63 (6 new findings)

## Changed Files

- `AGENTS.md` (modified, +28 / -4)
- `.github/workflows/release.yml` (modified, +44 / -18)
- `apps/web/src/billing/checkout.ts` (modified, +83 / -21)
- `apps/web/src/billing/webhook.ts` (modified, +39 / -15)
- `scripts/deploy.sh` (modified, +27 / -8)

_3 more changed files in the full report._

## Top Findings

| Severity | Finding | Location |
| --- | --- | --- |
| critical | Privileged workflow checks out pull request code | .github/workflows/release.yml:19 |
| critical | Secret-looking value added | .env.example:8 |
| high | Agent instructions changed | AGENTS.md |
| high | High-impact product area changed | apps/web/src/billing/checkout.ts |
| high | Verification script disabled: test | package.json |

_3 more findings in the full report._

## Required Checks

| Command | Result |
| --- | --- |
| `npm run lint --workspace @acme/web` | passed |
| `npm test --workspace @acme/web` | failed (1) |
| `npm run build --workspace @acme/web` | passed |
| `gh workflow view release.yml --yaml` | planned |

Full Markdown, JSON, SARIF, and HTML reports remain available as CI artifacts when configured.
