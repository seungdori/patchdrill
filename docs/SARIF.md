# SARIF Output

PatchDrill can emit SARIF 2.1.0 for GitHub code scanning:

```bash
patchdrill scan --base origin/main \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html \
  --run
patchdrill verify --evidence patchdrill-evidence.json
```

Each file-scoped finding becomes a SARIF result with:

- `ruleId`: deterministic finding or policy rule ID.
- `level`: mapped from severity.
- `location`: file and line when available.
- `properties`: severity and tags.
- `partialFingerprints`: stable PatchDrill fingerprints for GitHub alert tracking.

## GitHub Actions

```yaml
permissions:
  contents: read
  security-events: write

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
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
      fail-on: high
      max-risk: "69"
  - uses: github/codeql-action/upload-sarif@v4
    if: always()
    with:
      sarif_file: ${{ steps.patchdrill.outputs.report-sarif }}
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

## Severity Mapping

| PatchDrill | SARIF |
| --- | --- |
| `critical` | `error` |
| `high` | `error` |
| `medium` | `warning` |
| `low` | `note` |
| `info` | `note` |
