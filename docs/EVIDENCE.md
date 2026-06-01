# Evidence Manifest

PatchDrill can write a JSON evidence manifest for CI artifact storage and audit trails:

```bash
patchdrill scan --base origin/main --run \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --json patchdrill-report.json \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
```

The manifest includes:

- The PatchDrill report SHA-256 and byte length.
- SHA-256 digests for generated Markdown, JSON, SARIF, HTML, and compact-summary artifacts.
- Command result metadata with stdout and stderr digests, not raw command output.
- Local git branch, head SHA, and base SHA when available.
- The same summary scores used by the JSON report and dashboard.

Verify a saved manifest against its artifacts:

```bash
patchdrill verify --evidence patchdrill-evidence.json
```

Verification checks that recorded artifact SHA-256 values and byte lengths still match the files on disk. When a JSON report artifact is present, PatchDrill also cross-checks it against the manifest's report digest.

This keeps the default scanner local-only and deterministic while giving CI systems one small file that can prove which evidence artifacts belonged to a run.
