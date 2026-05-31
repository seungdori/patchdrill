# Baselines

PatchDrill can compare a scan against a previous JSON report.

```bash
patchdrill scan \
  --baseline previous-patchdrill-report.json \
  --json patchdrill-report.json \
  --markdown patchdrill-report.md
```

The report includes:

- Previous and current assessment status.
- Previous and current risk score.
- Risk delta.
- New, resolved, and unchanged finding counts.

Findings are compared by deterministic fingerprints built from rule id, severity, title, file, and line. The comparison is local and does not upload source code or reports.

In GitHub Actions, pass the baseline path after downloading or restoring a previous report artifact:

```yaml
- uses: your-org/patchdrill@v0
  with:
    baseline: previous-patchdrill-report.json
    json: patchdrill-report.json
```
