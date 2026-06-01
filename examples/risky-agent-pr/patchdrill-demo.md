# PatchDrill Report

Status: **FAIL**
Risk score: **94/100**
Confidence score: **21/100**
Generated: 2026-06-01T00:00:00.000Z
Schema version: 1

## Summary

- Changed files: 8
- Additions / deletions: +326 / -78
- Required verification commands: 4
- Failed verification commands: 1
- Added lines inspected: 326

## Policy

- Config: .patchdrill.yml
- Ignored path patterns: 2
- Fail-on severity: high
- Max risk: 69
- Policy rules: 4
- Policy commands: 1 required, 1 optional

## Code Owners

- Config: .github/CODEOWNERS
- Rules: 4

## Baseline

- Baseline report: main-patchdrill-report.json
- Status: warn -> fail
- Risk: 31/100 -> 94/100 (+63)
- Findings: 6 new, 0 resolved, 1 unchanged

## Project Signals

| Ecosystem | Framework | Entrypoint | Manifest | Package manager | Task runner |
| --- | --- | --- | --- | --- | --- |
| node |  |  | package.json | npm |  |
| github-actions |  |  | .github/workflows/release.yml |  |  |

## Affected Workspace Packages

| Package | Path |
| --- | --- |
| @acme/web | apps/web |

## Dependency Changes

| File | Type | Package | Path | Change | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| package-lock.json | lockfile | yaml | node_modules/yaml | updated | 2.8.1 | 2.9.0 |
| package-lock.json | lockfile | @acme/payments | node_modules/@acme/payments | updated | 4.2.0 | 4.3.0 |

## Package Script Changes

| File | Script | Change | Before | After |
| --- | --- | --- | --- | --- |
| package.json | `postinstall` | added | `` | `node scripts/bootstrap-agent.js` |
| package.json | `test` | updated | `vitest run` | `true` |

## Changed Files

| File | Status | +/- | Owners |
| --- | --- | --- | --- |
| AGENTS.md | modified | +28 / -4 | @acme/platform |
| .github/workflows/release.yml | modified | +44 / -18 | @acme/platform |
| apps/web/src/billing/checkout.ts | modified | +83 / -21 | @acme/billing |
| apps/web/src/billing/webhook.ts | modified | +39 / -15 | @acme/billing |
| scripts/deploy.sh | modified | +27 / -8 | @acme/platform |
| .env.example | modified | +3 / -0 | @acme/platform |
| package.json | modified | +14 / -4 | @acme/platform |
| package-lock.json | modified | +88 / -8 |  |

## Findings

| Severity | Rule | Finding | Location | Remediation |
| --- | --- | --- | --- | --- |
| critical | workflow.pull-request-target-head-checkout | Privileged workflow checks out pull request code: A pull_request_target workflow can run untrusted pull request code while write tokens or repository secrets are available. | .github/workflows/release.yml:19 | Use pull_request for untrusted code, remove PR-head checkout, or split the privileged publishing step behind an environment gate. |
| critical | secret.added | Secret-looking value added: A newly added environment example contains a value with a live-key shape. The demo redacts the actual token body. | .env.example:8 | Remove the value, rotate the credential if it was real, and use a non-secret placeholder such as <redacted>. |
| high | agent.instructions-changed | Agent instructions changed: Repository-level coding-agent instructions changed in the same patch as release and billing code. | AGENTS.md | Review instruction changes separately and require maintainer approval before agent-visible rules change. |
| high | file.high-impact-area | High-impact product area changed: Billing checkout and webhook code changed, which can affect payment capture, refunds, and entitlement state. | apps/web/src/billing/checkout.ts | Attach targeted billing regression tests and owner approval. |
| high | package-script.disabled-verification | Verification script disabled: test: package.json verification script "test" now appears to exit successfully without running meaningful checks. | package.json | Restore the real verification command or explain why this repository no longer has that check. |
| high | package-script.lifecycle | Package lifecycle script changed: postinstall: package.json lifecycle script "postinstall" was added, creating code that can run during install, prepare, pack, or publish flows. | package.json | Review the script as executable supply-chain surface. Prefer explicit CI steps or documented commands over implicit install-time behavior. |
| medium | test.missing-source-match | Source changed without matching test changes: Billing source files changed, but no matching checkout or webhook test files changed. | apps/web/src/billing/checkout.ts | Add or update tests covering signed webhook verification, failed payment paths, and entitlement updates. |
| low | dependency.lockfile-update | Dependency lockfile changed: @acme/payments changed from 4.2.0 to 4.3.0. | package-lock.json | Review release notes and verify transitive dependency impact. |

## Verification Plan

| Required | Package | Command | Reason |
| --- | --- | --- | --- |
| yes | @acme/web | `npm run lint --workspace @acme/web` | Billing and release-adjacent source files changed. |
| yes | @acme/web | `npm test --workspace @acme/web` | Billing checkout and webhook behavior changed. |
| yes | @acme/web | `npm run build --workspace @acme/web` | Production web package changed. |
| yes |  | `gh workflow view release.yml --yaml` | Repository policy requires human-readable workflow evidence when privileged release jobs change. |
| no | @acme/web | `npm run test:e2e -- --grep billing` | Optional browser coverage is available for checkout flows. |

## Command Results

### npm run lint --workspace @acme/web

- Exit code: 0
- Duration: 6240ms

```text
@acme/web lint: ok
```

### npm test --workspace @acme/web

- Exit code: 1
- Duration: 11982ms

```text
CheckoutService.test.ts: 38 passed, 1 failed
Webhook signature regression: expected 401, received 200
```

```text
FAIL apps/web/src/billing/webhook.test.ts > rejects unsigned webhook payloads
```

### npm run build --workspace @acme/web

- Exit code: 0
- Duration: 18321ms

```text
vite v6.0.0 building for production...
built in 4.2s
```

## Reviewer Notes

- Treat this report as triage evidence, not a replacement for review.
- High-impact areas still need human sign-off even when automated commands pass.
