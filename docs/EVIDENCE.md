# Proof Packs and Evidence Manifests

A Proof Pack is the portable evidence bundle PatchDrill creates for a patch. It can contain a compact Markdown summary, full Markdown report, JSON report, SARIF report, self-contained HTML dashboard, and a JSON evidence manifest.

The evidence manifest is the verifiable index for that bundle. It records artifact metadata and command-output digests so a reviewer or CI system can later prove which files belonged to the same scan:

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
- The PatchDrill version and report schema version that produced the bundle.
- Local git branch, head SHA, and base SHA when available.
- The same summary scores used by the JSON report and dashboard.

If a scan infers or configures required verification commands but no matching command results are present, the report includes a `verification.required-not-run` finding. This keeps local scans non-mutating by default while making missing evidence visible in the same report and evidence bundle.

Verify a saved manifest against its artifacts:

```bash
patchdrill verify --evidence patchdrill-evidence.json
```

Verification checks that recorded artifact SHA-256 values and byte lengths still match the files on disk. When a JSON report artifact is present, PatchDrill also cross-checks it against the manifest's report digest, verifies that the manifest summary, report counts, command result metadata, and command-output digests still match the JSON report, and rejects JSON reports whose summary counts no longer match their changed files, command plan, or command results.

Regenerate a manifest after post-processing final artifacts, such as re-rendering a dashboard with trend history:

```bash
patchdrill evidence \
  --json patchdrill-report.json \
  --evidence patchdrill-evidence.json \
  --summary-markdown patchdrill-summary.md \
  --markdown patchdrill-report.md \
  --sarif patchdrill.sarif \
  --html patchdrill-dashboard.html
patchdrill verify --evidence patchdrill-evidence.json
```

This keeps the default scanner local-only and deterministic while giving CI systems one small file that can prove which Proof Pack artifacts belonged to a run.
