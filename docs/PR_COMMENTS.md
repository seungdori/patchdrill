# Pull Request Comments

PatchDrill's composite GitHub Action can upsert the Markdown report as a pull request comment.

```yaml
permissions:
  contents: read
  pull-requests: write
  security-events: write

steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - uses: seungdori/patchdrill@v0
    with:
      base: origin/${{ github.base_ref }}
      markdown: patchdrill-report.md
      json: patchdrill-report.json
      sarif: patchdrill.sarif
      pr-comment: "true"
      comment-marker: "<!-- patchdrill-report -->"
```

PatchDrill finds an existing bot comment containing the marker and updates it. If no marker is present, it creates a new comment. This keeps PR discussions readable while preserving the latest verification evidence.

## Permissions

The workflow needs `pull-requests: write` to create or update PR comments. Keep other permissions least-privileged.
