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
          npx patchdrill scan --base origin/\${{ github.base_ref }} --markdown patchdrill-report.md --json patchdrill-report.json --fail-on high
      - name: Upload PatchDrill report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: patchdrill-report
          path: |
            patchdrill-report.md
            patchdrill-report.json
`;
}
