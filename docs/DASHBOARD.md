# Static HTML Dashboard

PatchDrill can write a self-contained HTML dashboard for local review and CI artifacts. It has no external assets, no network calls, and uses the same deterministic report data as Markdown, JSON, and SARIF output.

Generate the dashboard during a scan:

```bash
patchdrill scan --base origin/main --run \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
patchdrill verify --evidence patchdrill-evidence.json
```

Re-render a dashboard from a saved JSON report:

```bash
patchdrill dashboard --json patchdrill-report.json --output patchdrill-dashboard.html
```

Render a dashboard with CI artifact history by passing reports in oldest-to-newest order. The last `--json` is the current report used for the main dashboard, and earlier reports populate the run trend table.

```bash
patchdrill dashboard \
  --json reports/patchdrill-previous.json \
  --json reports/patchdrill-current.json \
  --output patchdrill-dashboard.html
```

The dashboard includes:

- Status, risk, confidence, changed-file, required-check, and added-line summary metrics.
- Multi-run risk and failed-check trends when repeated JSON reports are provided.
- Findings with severity, rule IDs, locations, tags, and remediation.
- Verification plans with per-command status, plus captured command results.
- Changed files, project signals, policy context, baseline context, owner context, and dependency changes.

For CI, upload the HTML alongside the JSON, Markdown, and evidence artifacts:

```yaml
- uses: seungdori/patchdrill@v0
  id: patchdrill
  with:
    base: origin/${{ github.base_ref }}
    evidence: patchdrill-evidence.json
    summary: patchdrill-summary.md
    markdown: patchdrill-report.md
    json: patchdrill-report.json
    sarif: patchdrill.sarif
    html: patchdrill-dashboard.html
    run: "true"
- uses: actions/upload-artifact@v7
  if: always()
  with:
    name: patchdrill-report
    path: |
      ${{ steps.patchdrill.outputs.report-evidence }}
      ${{ steps.patchdrill.outputs.report-markdown }}
      ${{ steps.patchdrill.outputs.report-html }}
      ${{ steps.patchdrill.outputs.report-json }}
      ${{ steps.patchdrill.outputs.report-sarif }}
      ${{ steps.patchdrill.outputs.report-summary }}
```

If your workflow downloads one or more previous JSON report artifacts before running PatchDrill, pass them through `dashboard-history`. PatchDrill appends the current JSON report automatically and re-renders the HTML dashboard with the trend table:

```yaml
- uses: seungdori/patchdrill@v0
  id: patchdrill
  with:
    base: origin/${{ github.base_ref }}
    evidence: patchdrill-evidence.json
    summary: patchdrill-summary.md
    markdown: patchdrill-report.md
    json: patchdrill-report.json
    sarif: patchdrill.sarif
    html: patchdrill-dashboard.html
    run: "true"
    dashboard-history: |
      reports/patchdrill-previous.json
      reports/patchdrill-last-green.json
```
