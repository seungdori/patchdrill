# Pull Request Comments

PatchDrill's composite GitHub Action can upsert a compact Markdown summary as a pull request comment.

```yaml
permissions:
  contents: read
  pull-requests: write
  security-events: write

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
  - uses: seungdori/patchdrill@v0
    with:
      base: origin/${{ github.base_ref }}
      summary: patchdrill-summary.md
      markdown: patchdrill-report.md
      json: patchdrill-report.json
      sarif: patchdrill.sarif
      pr-comment: "true"
      comment-marker: "<!-- patchdrill-report -->"
```

PatchDrill finds an existing bot comment containing the marker and updates it. If no marker is present, it creates a new comment. The comment uses the compact summary by default, while the full Markdown, JSON, SARIF, and HTML reports remain available as workflow artifacts.

Set `pr-comment: "false"` to skip comment writes while keeping the step summary, annotations, SARIF, HTML, JSON, Markdown, and evidence artifacts. The Action accepts `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"`, `"on"`, and `"off"` for boolean inputs.

To preview the comment body without opening a pull request, run:

```bash
patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
cat patchdrill-risky-demo/patchdrill-demo-summary.md
```

## Permissions

The workflow needs `pull-requests: write` to create or update PR comments. Keep other permissions least-privileged.

For fork pull requests where the workflow token is read-only, PatchDrill emits a warning and skips the comment instead of failing the verification run. The step summary, annotations, SARIF, HTML, JSON, Markdown, and evidence artifacts still remain available.
