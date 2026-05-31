import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeGitHubWorkflow(root: string, force = false): string {
  const workflowDir = join(root, ".github", "workflows");
  const workflowPath = join(workflowDir, "patchdrill.yml");
  if (existsSync(workflowPath) && !force) {
    throw new Error(`${workflowPath} already exists. Re-run with --force to overwrite.`);
  }
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(workflowPath, workflowTemplate(), "utf8");
  return workflowPath;
}

export function workflowTemplate(): string {
  return `name: PatchDrill

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  patchdrill:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Run PatchDrill
        run: |
          npx patchdrill scan --base origin/\${{ github.base_ref }} --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --fail-on high --max-risk 69
      - name: Add Step Summary
        if: always()
        run: cat patchdrill-report.md >> "$GITHUB_STEP_SUMMARY"
      - name: Upsert PR Comment
        if: always() && github.event_name == 'pull_request'
        uses: actions/github-script@v9
        env:
          PATCHDRILL_MARKDOWN: patchdrill-report.md
          PATCHDRILL_MARKER: "<!-- patchdrill-report -->"
        with:
          script: |
            const fs = require("fs");
            const marker = process.env.PATCHDRILL_MARKER;
            const markdownPath = process.env.PATCHDRILL_MARKDOWN;
            if (!fs.existsSync(markdownPath)) return;
            const body = \`\${marker}\\n\${fs.readFileSync(markdownPath, "utf8")}\`;
            const { owner, repo } = context.repo;
            const issue_number = context.payload.pull_request.number;
            const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 });
            const existing = comments.find((comment) => comment.user?.type === "Bot" && comment.body?.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
            } else {
              await github.rest.issues.createComment({ owner, repo, issue_number, body });
            }
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: patchdrill.sarif
      - name: Upload PatchDrill report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: patchdrill-report
          path: |
            patchdrill-report.md
            patchdrill-report.json
            patchdrill.sarif
`;
}
