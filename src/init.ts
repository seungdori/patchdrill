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

export function writePolicyFile(root: string, force = false): string {
  const policyPath = join(root, ".patchdrill.yml");
  if (existsSync(policyPath) && !force) {
    throw new Error(`${policyPath} already exists. Re-run with --force to overwrite.`);
  }
  writeFileSync(policyPath, policyTemplate(), "utf8");
  return policyPath;
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
      - uses: patchdrill/patchdrill@v0
        id: patchdrill
        with:
          base: origin/\${{ github.base_ref || 'main' }}
          markdown: patchdrill-report.md
          json: patchdrill-report.json
          sarif: patchdrill.sarif
          fail-on: high
          max-risk: "69"
          pr-comment: "true"
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: \${{ steps.patchdrill.outputs.report-sarif }}
      - name: Upload PatchDrill report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: patchdrill-report
          path: |
            \${{ steps.patchdrill.outputs.report-markdown }}
            \${{ steps.patchdrill.outputs.report-json }}
            \${{ steps.patchdrill.outputs.report-sarif }}
`;
}

export function policyTemplate(): string {
  return `failOn: high
maxRisk: 69

ignoredPaths:
  - dist/**
  - coverage/**
  - generated/**

requiredCommands: []
optionalCommands: []

rules:
  - id: agent-policy-review
    title: Agent policy review required
    severity: high
    path:
      - AGENTS.md
      - CLAUDE.md
      - GEMINI.md
      - .github/copilot-instructions.md
    detail: Agent-visible instruction files can change automated coding behavior.
    remediation: Require maintainer review for prompt, tool, memory, and workflow changes.
    tags:
      - ai-safety
      - agentic-ai
`;
}
