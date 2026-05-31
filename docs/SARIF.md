# SARIF Output

PatchDrill can emit SARIF 2.1.0 for GitHub code scanning:

```bash
patchdrill scan --base origin/main --sarif patchdrill.sarif
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
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  - run: npx patchdrill scan --base origin/${{ github.base_ref }} --sarif patchdrill.sarif --markdown patchdrill-report.md --json patchdrill-report.json --fail-on high --max-risk 69
  - uses: github/codeql-action/upload-sarif@v3
    if: always()
    with:
      sarif_file: patchdrill.sarif
```

## Severity Mapping

| PatchDrill | SARIF |
| --- | --- |
| `critical` | `error` |
| `high` | `error` |
| `medium` | `warning` |
| `low` | `note` |
| `info` | `note` |
