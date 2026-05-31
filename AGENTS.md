# Agent Instructions

PatchDrill is a deterministic developer tool. Keep changes evidence-first.

## Commands

- Build: `npm run build`
- Test: `npm test`
- Full check: `npm run check`

## Rules

- Do not add network calls to default scan behavior.
- Do not make `scan` mutate the repository.
- `--run` may execute commands, but inferred commands should be conservative and reviewable.
- Every risk score increase should map to a human-readable finding.
- Add tests for new project detectors, command planners, and risk rules.
