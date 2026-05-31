# PatchDrill Report

Status: **WARN**
Risk score: **42/100**
Confidence score: **58/100**
Generated: 2026-06-01T00:00:00.000Z

## Summary

- Changed files: 3
- Additions / deletions: +84 / -12
- Required verification commands: 2
- Failed verification commands: 0
- Added lines inspected: 84

## Project Signals

| Ecosystem | Manifest | Package manager |
| --- | --- | --- |
| node | package.json | pnpm |

## Changed Files

| File | Status | +/- |
| --- | --- | --- |
| src/auth/session.ts | modified | +40 / -8 |
| src/auth/session.test.ts | modified | +39 / -4 |
| pnpm-lock.yaml | modified | +5 / -0 |

## Findings

| Severity | Rule | Finding | Location | Remediation |
| --- | --- | --- | --- | --- |
| high | file.high-impact-area | High-impact product area changed: Authentication, billing, migrations, or security changes need stronger regression proof. | src/auth/session.ts | Add targeted tests and include manual verification notes in the PR. |
| medium | file.lockfile | Dependency lockfile changed: Dependency graph changes can introduce supply-chain, licensing, or runtime regressions. | pnpm-lock.yaml | Review direct and transitive dependency changes before merge. |

## Verification Plan

| Required | Command | Reason |
| --- | --- | --- |
| yes | `pnpm test` | package.json defines "test", and Node-related files changed. |
| yes | `pnpm typecheck` | package.json defines "typecheck", and Node-related files changed. |

## Reviewer Notes

- Treat this report as triage evidence, not a replacement for review.
- High-impact areas still need human sign-off even when automated commands pass.
