# PatchDrill Summary

**WARN** - risk 58/100, confidence 82/100

- Changed files: 5 (+186 / -42)
- Verification plan: 3 required, 1 optional
- Command results: 3 run, 0 failed
- Baseline risk delta: +14 (2 new findings)

## Changed Files

- `apps/api/src/auth/session.ts` (modified, +54 / -16)
- `apps/api/src/auth/session.test.ts` (modified, +48 / -4)
- `packages/db/migrations/20260601090000_add_session_rotation.sql` (added, +38 / -0)
- `.github/workflows/deploy.yml` (modified, +22 / -12)
- `package-lock.json` (modified, +24 / -10)

## Top Findings

| Severity | Finding | Location |
| --- | --- | --- |
| high | High-impact product area changed | apps/api/src/auth/session.ts |
| high | Data migration review required | packages/db/migrations/20260601090000_add_session_rotation.sql |
| medium | OIDC deployment job should use a protected environment | .github/workflows/deploy.yml:34 |
| low | Dependency lockfile changed | package-lock.json |

## Required Checks

| Command | Result |
| --- | --- |
| `pnpm exec turbo run typecheck --filter=@acme/api` | passed |
| `pnpm exec turbo run test --filter=@acme/api` | passed |
| `pnpm run test:contracts` | passed |

Full Markdown, JSON, SARIF, and HTML reports remain available as CI artifacts when configured.
