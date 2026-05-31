import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const policyPackNames = ["default", "regulated", "agentic"] as const;
export type PolicyPackName = (typeof policyPackNames)[number];

export function isPolicyPackName(value: string): value is PolicyPackName {
  return (policyPackNames as readonly string[]).includes(value);
}

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

export function writePolicyFile(root: string, force = false, pack: PolicyPackName = "default"): string {
  const policyPath = join(root, ".patchdrill.yml");
  if (existsSync(policyPath) && !force) {
    throw new Error(`${policyPath} already exists. Re-run with --force to overwrite.`);
  }
  writeFileSync(policyPath, policyTemplate(pack), "utf8");
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

export function policyTemplate(pack: PolicyPackName = "default"): string {
  if (pack === "regulated") return regulatedPolicyTemplate();
  if (pack === "agentic") return agenticPolicyTemplate();
  return defaultPolicyTemplate();
}

function defaultPolicyTemplate(): string {
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

function regulatedPolicyTemplate(): string {
  return `failOn: high
maxRisk: 60

ignoredPaths:
  - dist/**
  - coverage/**
  - generated/**
  - "**/*.snap"

requiredCommands: []
optionalCommands: []

rules:
  - id: payments-owner-review
    title: Payments owner review required
    severity: critical
    path:
      - src/**/billing/**
      - src/**/checkout/**
      - src/**/payments/**
      - services/**/billing/**
      - services/**/payments/**
    detail: Payment and billing code requires domain-owner review.
    remediation: Attach test evidence, rollback notes, and owner approval before merge.
    tags:
      - payments
      - owner-review
      - compliance
  - id: identity-access-review
    title: Identity and access review required
    severity: critical
    path:
      - src/**/auth/**
      - src/**/authorization/**
      - src/**/permissions/**
      - services/**/auth/**
      - services/**/permissions/**
    detail: Identity, session, and authorization changes can alter account boundaries.
    remediation: Require security review plus targeted authentication and authorization regression evidence.
    tags:
      - security
      - identity
      - compliance
  - id: data-migration-review
    title: Data migration review required
    severity: high
    path:
      - "**/migrations/**"
      - "**/schema/**"
      - prisma/**
      - db/**
    detail: Data shape changes can cause irreversible production effects.
    remediation: Include migration plan, rollback plan, dry-run evidence, and data owner review.
    tags:
      - data
      - migration
      - compliance
  - id: release-infra-review
    title: Release infrastructure review required
    severity: high
    path:
      - .github/workflows/**
      - Dockerfile
      - docker-compose.yml
      - infra/**
      - "**/*.tf"
    detail: CI, deployment, and infrastructure changes affect release trust boundaries.
    remediation: Review permissions, secrets, environment access, and rollback behavior.
    tags:
      - ci
      - deployment
      - compliance
`;
}

function agenticPolicyTemplate(): string {
  return `failOn: high
maxRisk: 65

ignoredPaths:
  - dist/**
  - coverage/**
  - generated/**

requiredCommands: []
optionalCommands: []

rules:
  - id: agent-policy-review
    title: Agent policy review required
    severity: critical
    path:
      - AGENTS.md
      - CLAUDE.md
      - GEMINI.md
      - CURSOR.md
      - .github/copilot-instructions.md
      - .cursor/rules/**
    detail: Agent-visible instruction files can change automated coding behavior.
    remediation: Require maintainer review for prompt, tool, memory, and workflow changes.
    tags:
      - ai-safety
      - agentic-ai
  - id: mcp-tool-review
    title: MCP tool configuration review required
    severity: critical
    path:
      - .mcp.json
      - mcp.json
      - .cursor/mcp.json
      - claude_desktop_config.json
      - .claude/settings/**
    detail: MCP and agent tool configs can grant local tools, credentials, or network access.
    remediation: Review tool allowlists, command arguments, environment variables, and credential sources.
    tags:
      - ai-safety
      - mcp
      - tools
  - id: prompt-template-review
    title: Prompt template review required
    severity: high
    path:
      - prompts/**
      - "**/*.prompt.md"
      - "**/*.prompt.txt"
      - .github/ISSUE_TEMPLATE/**
    detail: Prompt and template changes can alter AI behavior or expose sensitive workflow context.
    remediation: Keep untrusted examples out of privileged prompts and require review from prompt owners.
    tags:
      - ai-safety
      - prompt-injection
`;
}
