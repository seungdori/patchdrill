# PatchDrill Report

Status: **WARN**
Risk score: **48/100**
Confidence score: **52/100**
Generated: 2026-06-01T00:00:00.000Z
Schema version: 1

## Summary

- Changed files: 4
- Additions / deletions: +96 / -18
- Required verification commands: 3
- Failed verification commands: 0
- Added lines inspected: 96

## Policy

- Config: .patchdrill.yml
- Ignored path patterns: 3
- Fail-on severity: high
- Max risk: 69
- Policy rules: 1
- Policy commands: 1 required, 0 optional

## Code Owners

- Config: .github/CODEOWNERS
- Rules: 4

## Baseline

- Baseline report: previous-patchdrill-report.json
- Status: pass -> warn
- Risk: 34/100 -> 48/100 (+14)
- Findings: 1 new, 0 resolved, 2 unchanged

## Project Signals

| Ecosystem | Manifest | Package manager |
| --- | --- | --- |
| node | package.json | pnpm |

## Affected Workspace Packages

| Package | Path |
| --- | --- |
| @acme/auth | packages/auth |
| @acme/web | apps/web |

## Dependency Changes

| File | Type | Package | Path | Change | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| package.json | dependencies | react |  | updated | ^18.2.0 | ^19.0.0 |
| requirements.txt | dependencies | requests |  | updated | ==2.31.0 | ==2.32.0 |
| package-lock.json | lockfile | react | node_modules/react | updated | 18.2.0 | 19.0.0 |
| pnpm-lock.yaml | lockfile | @acme/ui | @acme/ui@1.4.0 -> @acme/ui@1.5.0 | updated | 1.4.0 | 1.5.0 |
| yarn.lock | lockfile | zod | zod@^3.0.0 -> zod@^4.0.0 | updated | 3.0.0 | 4.0.0 |
| bun.lock | lockfile | react | react | updated | 18.2.0 | 19.0.0 |
| go.sum | lockfile | github.com/gin-gonic/gin | github.com/gin-gonic/gin@v1.9.0 -> github.com/gin-gonic/gin@v1.10.0 | updated | v1.9.0 | v1.10.0 |
| Cargo.lock | lockfile | anyhow | anyhow@1.0.80 -> anyhow@1.0.81 | updated | 1.0.80 | 1.0.81 |
| poetry.lock | lockfile | black | black@24.1.0 -> black@24.2.0 | updated | 24.1.0 | 24.2.0 |
| Pipfile.lock | lockfile | requests | default.requests | updated | ==2.31.0 | ==2.32.0 |
| Gemfile.lock | lockfile | rails | rails@7.1.3 -> rails@7.2.0 | updated | 7.1.3 | 7.2.0 |
| composer.lock | lockfile | monolog/monolog | packages.monolog/monolog | updated | 3.5.0 | 3.6.0 |
| package-lock.json | lockfile | yaml | node_modules/yaml | added |  | 2.0.0 |

## Changed Files

| File | Status | +/- | Owners |
| --- | --- | --- | --- |
| packages/auth/src/session.ts | modified | +44 / -10 | @acme/security |
| packages/auth/src/session.test.ts | modified | +38 / -8 | @acme/security |
| apps/web/src/login.tsx | modified | +9 / -0 | @acme/web |
| package-lock.json | modified | +5 / -0 | @acme/platform |

## Findings

| Severity | Rule | Finding | Location | Remediation |
| --- | --- | --- | --- | --- |
| high | file.high-impact-area | High-impact product area changed: Authentication, billing, migrations, or security changes need stronger regression proof. | packages/auth/src/session.ts | Add targeted tests and include manual verification notes in the PR. |
| medium | file.lockfile | Dependency lockfile changed: Dependency graph changes can introduce supply-chain, licensing, or runtime regressions. | package-lock.json | Review direct and transitive dependency changes before merge. |

## Verification Plan

| Required | Package | Command | Reason |
| --- | --- | --- | --- |
| yes | @acme/auth | `pnpm --filter @acme/auth run test` | @acme/auth changed under packages/auth, and its package.json defines "test". |
| yes | @acme/auth | `pnpm --filter @acme/auth run build` | @acme/auth changed under packages/auth, and its package.json defines "build". |
| yes | @acme/web | `pnpm --filter @acme/web run test` | @acme/web depends on @acme/auth, and its package.json defines "test". |

## Command Results

### pnpm --filter @acme/auth run test

- Exit code: 0
- Duration: 1240ms

```text
Test Files  12 passed
Tests       87 passed
```

## Reviewer Notes

- Treat this report as triage evidence, not a replacement for review.
- High-impact areas still need human sign-off even when automated commands pass.
