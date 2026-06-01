# PatchDrill Report

Status: **WARN**
Risk score: **58/100**
Confidence score: **82/100**
Generated: 2026-06-01T00:00:00.000Z
Schema version: 1

## Summary

- Changed files: 5
- Additions / deletions: +186 / -42
- Required verification commands: 3
- Failed verification commands: 0
- Added lines inspected: 186

## Policy

- Config: .patchdrill.yml
- Ignored path patterns: 2
- Fail-on severity: high
- Max risk: 69
- Policy rules: 2
- Policy commands: 1 required, 1 optional

## Code Owners

- Config: .github/CODEOWNERS
- Rules: 3

## Baseline

- Baseline report: previous-patchdrill-report.json
- Status: warn -> warn
- Risk: 44/100 -> 58/100 (+14)
- Findings: 2 new, 1 resolved, 3 unchanged

## Project Signals

| Ecosystem | Framework | Entrypoint | Manifest | Package manager | Task runner |
| --- | --- | --- | --- | --- | --- |
| node |  |  | package.json | pnpm | turbo |
| github-actions |  |  | .github/workflows/deploy.yml |  |  |

## Affected Workspace Packages

| Package | Path |
| --- | --- |
| @acme/api | apps/api |

## Dependency Changes

| File | Type | Package | Path | Change | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| package-lock.json | lockfile | @acme/session-store | node_modules/@acme/session-store | updated | 1.8.2 | 1.9.0 |

## Changed Files

| File | Status | +/- | Owners |
| --- | --- | --- | --- |
| apps/api/src/auth/session.ts | modified | +54 / -16 | @acme/security |
| apps/api/src/auth/session.test.ts | modified | +48 / -4 | @acme/security |
| packages/db/migrations/20260601090000_add_session_rotation.sql | added | +38 / -0 | @acme/data |
| .github/workflows/deploy.yml | modified | +22 / -12 | @acme/platform |
| package-lock.json | modified | +24 / -10 |  |

## Findings

| Severity | Rule | Finding | Location | Remediation |
| --- | --- | --- | --- | --- |
| high | file.high-impact-area | High-impact product area changed: Authentication/session code changed and needs strong proof before merge. | apps/api/src/auth/session.ts | Require owner review and targeted session regression evidence. |
| high | file.migration-review | Data migration review required: A database migration can alter production session state. | packages/db/migrations/20260601090000_add_session_rotation.sql | Attach dry-run, rollback, and data-owner approval notes. |
| medium | workflow.oidc-environment | OIDC deployment job should use a protected environment: A deployment workflow can mint cloud credentials without an explicit GitHub environment gate. | .github/workflows/deploy.yml:34 | Attach a protected environment or document why this job cannot deploy. |
| low | dependency.lockfile-update | Dependency lockfile changed: @acme/session-store changed from 1.8.2 to 1.9.0. | package-lock.json | Review release notes and verify transitive dependency impact. |

## Verification Plan

| Required | Package | Command | Reason |
| --- | --- | --- | --- |
| yes | @acme/api | `pnpm exec turbo run typecheck --filter=@acme/api` | Auth source changed in @acme/api. |
| yes | @acme/api | `pnpm exec turbo run test --filter=@acme/api` | Session behavior changed and matching tests exist. |
| yes |  | `pnpm run test:contracts` | Repository policy requires contract tests for auth/session changes. |
| no |  | `pnpm run test:e2e` | Optional browser coverage is available for session rotation flows. |

## Command Results

### pnpm exec turbo run typecheck --filter=@acme/api

- Exit code: 0
- Duration: 8421ms

```text
@acme/api:typecheck: cache miss, executing
@acme/api:typecheck: ok
```

### pnpm exec turbo run test --filter=@acme/api

- Exit code: 0
- Duration: 12544ms

```text
@acme/api:test: 42 tests passed
```

### pnpm run test:contracts

- Exit code: 0
- Duration: 15038ms

```text
contract auth-session passed
contract deployment-claims passed
```

## Reviewer Notes

- Treat this report as triage evidence, not a replacement for review.
- High-impact areas still need human sign-off even when automated commands pass.

