## Summary

-

## Verification

- [ ] `npm run check`
- [ ] `node dist/cli.js scan --evidence patchdrill-evidence.json --summary-markdown patchdrill-summary.md --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --html patchdrill-dashboard.html --run --fail-on critical`
- [ ] `node dist/cli.js verify --evidence patchdrill-evidence.json`
- [ ] `npm pack --dry-run`

## Risk Notes

- Changed risk rules, policy behavior, command planning, GitHub Actions, or release flow:
- Report/schema compatibility impact:
