import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { inspectDoctor, renderDoctor } from "./doctor.js";
import { formatEvidenceVerification, verifyEvidenceManifest } from "./evidence.js";
import { LOCALES, type Locale } from "./i18n.js";
import { checkReleaseReadiness, createReleaseReadinessReport, renderReleaseReadiness, summarizeReleaseReadiness } from "./release-readiness.js";
import { renderSummaryMarkdown, shouldFail, type GateOptions } from "./report.js";
import { readSchema, schemaNames } from "./schema.js";
import { scan } from "./scan.js";
import type { PatchReport, ScanOptions, Severity } from "./types.js";
import { readVersion } from "./version.js";
import { verificationSummary } from "./verification.js";

const severityValues = ["info", "low", "medium", "high", "critical"] as const;

export const PATCHDRILL_MCP_TOOLS = [
  "patchdrill_scan",
  "patchdrill_proof_pack",
  "patchdrill_run_verification",
  "patchdrill_doctor",
  "patchdrill_verify_evidence",
  "patchdrill_release_check"
] as const;

export const PATCHDRILL_MCP_PROMPTS = [
  "patchdrill_explain_merge_risk",
  "patchdrill_draft_pr_comment",
  "patchdrill_triage_findings",
  "patchdrill_plan_verification"
] as const;

export const PATCHDRILL_MCP_RESOURCE_URIS = [
  "patchdrill://manifest",
  "patchdrill://schema/policy",
  "patchdrill://schema/report",
  "patchdrill://schema/evidence",
  "patchdrill://schema/doctor",
  "patchdrill://schema/release-check",
  "patchdrill://docs/mcp",
  "patchdrill://docs/rule-catalog",
  "patchdrill://docs/proof-packs",
  "patchdrill://docs/security-posture"
] as const;

export interface PatchDrillMcpServerOptions {
  workspaceRoot?: string;
  allowAnyCwd?: boolean;
  version?: string;
}

interface RuntimeOptions {
  workspaceRoot: string;
  allowAnyCwd: boolean;
}

interface CommonScanInput {
  cwd?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
  configPath?: string | undefined;
  baselinePath?: string | undefined;
  locale?: Locale | undefined;
  failOn?: Severity | undefined;
  maxRisk?: number | undefined;
  maxRiskDelta?: number | undefined;
  maxFindings?: number | undefined;
}

interface ProofPackInput extends CommonScanInput {
  outputDirectory?: string | undefined;
  prefix?: string | undefined;
}

export async function startPatchDrillMcpServer(options: PatchDrillMcpServerOptions = {}): Promise<void> {
  const server = createPatchDrillMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createPatchDrillMcpServer(options: PatchDrillMcpServerOptions = {}): McpServer {
  const runtime = resolveRuntimeOptions(options);
  const server = new McpServer(
    {
      name: "patchdrill",
      version: options.version ?? readVersion()
    },
    {
      instructions: [
        "PatchDrill is a deterministic proof backend for AI-assisted code review.",
        "Use patchdrill_scan for read-only diff analysis before asking a model to interpret risk.",
        "Do not treat LLM interpretation as the source of truth: gate status, risk score, findings, command plans, and evidence verification come from PatchDrill.",
        "patchdrill_run_verification executes repository-defined commands only when allowCommandExecution is true."
      ].join(" ")
    }
  );

  registerTools(server, runtime);
  registerResources(server);
  registerPrompts(server);
  return server;
}

function registerTools(server: McpServer, runtime: RuntimeOptions): void {
  server.registerTool(
    "patchdrill_scan",
    {
      title: "Scan patch",
      description: "Read-only PatchDrill scan. It never runs repository commands and never writes Proof Pack artifacts.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: commonScanInputShape,
      outputSchema: toolOutputSchema
    },
    (input) =>
      withToolErrors("patchdrill_scan", async () => {
        const report = await scan(scanOptionsFromInput(input, runtime));
        const gate = gateOptions(input, report);
        return toolOk(scanToolOutput(report, gate, input.maxFindings));
      })
  );

  server.registerTool(
    "patchdrill_proof_pack",
    {
      title: "Generate Proof Pack",
      description: "Generate Markdown, JSON, SARIF, HTML, and evidence artifacts without executing repository commands.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: proofPackInputShape,
      outputSchema: toolOutputSchema
    },
    (input) =>
      withToolErrors("patchdrill_proof_pack", async () => {
        const paths = proofPackPaths(input);
        const report = await scan({
          ...scanOptionsFromInput(input, runtime),
          summaryMarkdownPath: paths.summaryMarkdown,
          markdownPath: paths.markdown,
          jsonPath: paths.json,
          sarifPath: paths.sarif,
          htmlPath: paths.html,
          evidencePath: paths.evidence
        });
        const evidence = verifyEvidenceManifest(paths.evidence, report.root);
        const gate = gateOptions(input, report);
        return toolOk({
          ...scanToolOutput(report, gate, input.maxFindings),
          artifactPaths: paths,
          evidenceVerification: evidence
        });
      })
  );

  server.registerTool(
    "patchdrill_run_verification",
    {
      title: "Run verification",
      description:
        "Execute PatchDrill's inferred required verification commands and generate a full evidence-backed Proof Pack. Requires allowCommandExecution: true.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      inputSchema: runVerificationInputShape,
      outputSchema: toolOutputSchema
    },
    (input) =>
      withToolErrors("patchdrill_run_verification", async () => {
        if (input.allowCommandExecution !== true) {
          throw new Error("patchdrill_run_verification requires allowCommandExecution: true because it executes repository-defined commands.");
        }
        const paths = proofPackPaths(input);
        const report = await scan({
          ...scanOptionsFromInput(input, runtime),
          run: true,
          ...(input.runOptional ? { runOptional: true } : {}),
          ...(input.maxOutputChars !== undefined ? { maxOutputChars: input.maxOutputChars } : {}),
          ...(input.commandTimeoutMs !== undefined ? { commandTimeoutMs: input.commandTimeoutMs } : {}),
          summaryMarkdownPath: paths.summaryMarkdown,
          markdownPath: paths.markdown,
          jsonPath: paths.json,
          sarifPath: paths.sarif,
          htmlPath: paths.html,
          evidencePath: paths.evidence
        });
        const evidence = verifyEvidenceManifest(paths.evidence, report.root);
        const gate = gateOptions(input, report);
        return toolOk({
          ...scanToolOutput(report, gate, input.maxFindings),
          artifactPaths: paths,
          evidenceVerification: evidence
        });
      })
  );

  server.registerTool(
    "patchdrill_doctor",
    {
      title: "Doctor",
      description: "Inspect repository readiness for PatchDrill without mutating files or running verification commands.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: cwdOnlyInputShape,
      outputSchema: toolOutputSchema
    },
    (input) =>
      withToolErrors("patchdrill_doctor", () => {
        const root = resolveToolCwd(input.cwd, runtime);
        const report = inspectDoctor(root);
        return toolOk({
          root: report.root,
          summary: report.summary,
          projectSignals: report.projectSignals,
          checks: report.checks,
          suggestedCommands: report.suggestedCommands,
          report,
          text: renderDoctor(report).trimEnd()
        });
      })
  );

  server.registerTool(
    "patchdrill_verify_evidence",
    {
      title: "Verify evidence",
      description: "Verify a PatchDrill evidence manifest and its referenced artifacts.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: evidenceInputShape,
      outputSchema: toolOutputSchema
    },
    (input) =>
      withToolErrors("patchdrill_verify_evidence", () => {
        const root = resolveToolCwd(input.cwd, runtime);
        const evidencePath = safeRepoRelativePath(input.evidencePath, "evidencePath");
        const result = verifyEvidenceManifest(evidencePath, root);
        return toolOk({
          root,
          evidencePath,
          verification: result,
          text: formatEvidenceVerification(result)
        });
      })
  );

  server.registerTool(
    "patchdrill_release_check",
    {
      title: "Release check",
      description: "Run PatchDrill's local release-readiness checks for this package.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: cwdOnlyInputShape,
      outputSchema: toolOutputSchema
    },
    (input) =>
      withToolErrors("patchdrill_release_check", () => {
        const root = resolveToolCwd(input.cwd, runtime);
        const checks = checkReleaseReadiness(root);
        const summary = summarizeReleaseReadiness(checks);
        return toolOk({
          root,
          ok: summary.ok,
          summary,
          checks,
          report: createReleaseReadinessReport(checks),
          text: renderReleaseReadiness(checks).trimEnd()
        });
      })
  );
}

function registerResources(server: McpServer): void {
  server.registerResource(
    "patchdrill-manifest",
    "patchdrill://manifest",
    {
      title: "PatchDrill MCP Manifest",
      description: "The PatchDrill MCP product surface, safety contract, tools, prompts, and resource URIs.",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: `${JSON.stringify(mcpManifest(), null, 2)}\n`
        }
      ]
    })
  );

  for (const schemaName of schemaNames) {
    server.registerResource(
      `patchdrill-${schemaName}-schema`,
      `patchdrill://schema/${schemaName}`,
      {
        title: `PatchDrill ${schemaName} schema`,
        description: `JSON Schema for PatchDrill ${schemaName} output.`,
        mimeType: "application/schema+json"
      },
      (uri) => ({
        contents: [{ uri: uri.href, mimeType: "application/schema+json", text: readSchema(schemaName) }]
      })
    );
  }

  registerDocResource(server, "patchdrill-mcp-docs", "patchdrill://docs/mcp", "PatchDrill MCP Guide", "MCP.md");
  registerDocResource(server, "patchdrill-rule-catalog", "patchdrill://docs/rule-catalog", "PatchDrill Rule Catalog", "RULE_CATALOG.md");
  registerDocResource(server, "patchdrill-proof-packs", "patchdrill://docs/proof-packs", "PatchDrill Proof Packs", "PROOF_PACKS.md");
  registerDocResource(
    server,
    "patchdrill-security-posture",
    "patchdrill://docs/security-posture",
    "PatchDrill Security Posture",
    "SECURITY_POSTURE.md"
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "patchdrill_explain_merge_risk",
    {
      title: "Explain merge risk",
      description: "Explain a PatchDrill report for a reviewer without changing deterministic findings or gate status.",
      argsSchema: promptArgsShape
    },
    ({ reportJson, audience }) => promptMessages(explainMergeRiskPrompt(reportJson, audience))
  );

  server.registerPrompt(
    "patchdrill_draft_pr_comment",
    {
      title: "Draft PR comment",
      description: "Draft a concise PR comment from PatchDrill findings, command plans, and evidence status.",
      argsSchema: promptArgsShape
    },
    ({ reportJson, audience }) => promptMessages(draftPrCommentPrompt(reportJson, audience))
  );

  server.registerPrompt(
    "patchdrill_triage_findings",
    {
      title: "Triage findings",
      description: "Prioritize PatchDrill findings by merge-blocking risk and likely owner action.",
      argsSchema: promptArgsShape
    },
    ({ reportJson, audience }) => promptMessages(triageFindingsPrompt(reportJson, audience))
  );

  server.registerPrompt(
    "patchdrill_plan_verification",
    {
      title: "Plan verification",
      description: "Turn a PatchDrill command plan into an execution strategy while preserving command text exactly.",
      argsSchema: promptArgsShape
    },
    ({ reportJson, audience }) => promptMessages(planVerificationPrompt(reportJson, audience))
  );
}

function registerDocResource(server: McpServer, name: string, uriValue: string, title: string, fileName: string): void {
  server.registerResource(
    name,
    uriValue,
    {
      title,
      description: `${title} documentation.`,
      mimeType: "text/markdown"
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: readDoc(fileName) }]
    })
  );
}

function scanOptionsFromInput(input: CommonScanInput, runtime: RuntimeOptions): ScanOptions {
  return {
    cwd: resolveToolCwd(input.cwd, runtime),
    ...(input.base ? { base: input.base } : {}),
    ...(input.head ? { head: input.head } : {}),
    ...(input.configPath ? { configPath: safeRepoRelativePath(input.configPath, "configPath") } : {}),
    ...(input.baselinePath ? { baselinePath: safeRepoRelativePath(input.baselinePath, "baselinePath") } : {}),
    ...(input.locale ? { locale: input.locale } : {})
  };
}

function scanToolOutput(report: PatchReport, gateOptions: GateOptions, maxFindings: number | undefined): Record<string, unknown> {
  const gateFailed = shouldFail(report, gateOptions);
  const topFindingCount = maxFindings ?? 10;
  const requiredCommands = report.commandPlan.filter((command) => command.required);
  const optionalCommands = report.commandPlan.filter((command) => !command.required);
  return {
    root: report.root,
    base: report.base,
    head: report.head,
    gate: {
      status: gateFailed ? "fail" : "pass",
      failed: gateFailed,
      failOn: gateOptions.failOn,
      maxRisk: gateOptions.maxRisk,
      maxRiskDelta: gateOptions.maxRiskDelta
    },
    summary: report.summary,
    verification: verificationSummary(report),
    topFindings: report.findings.slice(0, topFindingCount),
    requiredCommands,
    optionalCommands,
    report,
    text: renderSummaryMarkdown(report).trimEnd()
  };
}

function gateOptions(input: CommonScanInput, report: PatchReport): GateOptions {
  return {
    failOn: input.failOn ?? report.policy?.failOn ?? "critical",
    maxRisk: input.maxRisk ?? report.policy?.maxRisk ?? 69,
    ...(input.maxRiskDelta !== undefined ? { maxRiskDelta: input.maxRiskDelta } : {})
  };
}

function proofPackPaths(input: ProofPackInput): {
  summaryMarkdown: string;
  markdown: string;
  json: string;
  sarif: string;
  html: string;
  evidence: string;
} {
  const outputDirectory = safeRepoRelativePath(input.outputDirectory ?? ".patchdrill/mcp", "outputDirectory");
  const prefix = input.prefix ?? "patchdrill";
  const base = outputDirectory === "." ? "" : `${outputDirectory}/`;
  return {
    summaryMarkdown: `${base}${prefix}-summary.md`,
    markdown: `${base}${prefix}-report.md`,
    json: `${base}${prefix}-report.json`,
    sarif: `${base}${prefix}.sarif`,
    html: `${base}${prefix}-dashboard.html`,
    evidence: `${base}${prefix}-evidence.json`
  };
}

function resolveRuntimeOptions(options: PatchDrillMcpServerOptions): RuntimeOptions {
  return {
    workspaceRoot: canonicalPath(options.workspaceRoot ?? process.cwd()),
    allowAnyCwd: options.allowAnyCwd ?? false
  };
}

function resolveToolCwd(cwd: string | undefined, runtime: RuntimeOptions): string {
  const requested = canonicalPath(resolve(runtime.workspaceRoot, cwd ?? "."));
  if (!runtime.allowAnyCwd && !isPathInside(requested, runtime.workspaceRoot)) {
    throw new Error(
      `MCP cwd must stay inside ${runtime.workspaceRoot}. Set PATCHDRILL_MCP_ALLOW_ANY_CWD=1 when you intentionally want this server to scan other repositories.`
    );
  }
  return requested;
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function isPathInside(child: string, parent: string): boolean {
  const normalizedChild = child.replaceAll("\\", "/");
  const normalizedParent = parent.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

function safeRepoRelativePath(value: string, label: string): string {
  const normalized = value.replaceAll("\\", "/").trim();
  if (normalized.length === 0) throw new Error(`${label} must not be empty.`);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) throw new Error(`${label} must be relative to the repository root.`);
  if (normalized.includes("\0")) throw new Error(`${label} must not contain null bytes.`);
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.includes("..")) throw new Error(`${label} must not contain .. path segments.`);
  if (parts.some((part) => part.includes(":"))) throw new Error(`${label} must not contain colon path segments.`);
  return parts.join("/") || ".";
}

async function withToolErrors(name: string, cb: () => ToolResult | Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await cb();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(name, message);
  }
}

interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

function toolOk(output: Record<string, unknown>): ToolResult {
  const structuredContent = { ok: true, ...output };
  const text = typeof output.text === "string" ? output.text : JSON.stringify(structuredContent, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

function toolError(name: string, message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${name}: ${message}` }],
    structuredContent: { ok: false, error: message }
  };
}

function mcpManifest(): Record<string, unknown> {
  return {
    name: "patchdrill",
    version: readVersion(),
    safety: {
      deterministicCore: true,
      defaultScanRunsCommands: false,
      defaultScanWritesFiles: false,
      defaultNetworkCalls: false,
      commandExecutionRequires: "patchdrill_run_verification with allowCommandExecution: true",
      llmRole: "Interpret PatchDrill output; never rewrite gate status, risk score, findings, command text, or evidence verification."
    },
    tools: PATCHDRILL_MCP_TOOLS,
    prompts: PATCHDRILL_MCP_PROMPTS,
    resources: PATCHDRILL_MCP_RESOURCE_URIS
  };
}

function readDoc(fileName: string): string {
  return readFileSync(new URL(`../docs/${fileName}`, import.meta.url), "utf8");
}

function promptMessages(text: string): {
  messages: {
    role: "user";
    content: {
      type: "text";
      text: string;
    };
  }[];
} {
  return {
    messages: [
      {
        role: "user",
        content: { type: "text", text }
      }
    ]
  };
}

function explainMergeRiskPrompt(reportJson: string | undefined, audience: string | undefined): string {
  return basePrompt("Explain the merge risk in this PatchDrill report.", reportJson, audience);
}

function draftPrCommentPrompt(reportJson: string | undefined, audience: string | undefined): string {
  return basePrompt("Draft a concise pull request comment from this PatchDrill report.", reportJson, audience);
}

function triageFindingsPrompt(reportJson: string | undefined, audience: string | undefined): string {
  return basePrompt("Triage the PatchDrill findings into merge blockers, reviewer follow-ups, and optional cleanup.", reportJson, audience);
}

function planVerificationPrompt(reportJson: string | undefined, audience: string | undefined): string {
  return basePrompt("Create a verification execution plan from the PatchDrill command plan.", reportJson, audience);
}

function basePrompt(task: string, reportJson: string | undefined, audience: string | undefined): string {
  const reportSection = reportJson ? `\n\nPatchDrill report JSON:\n\`\`\`json\n${reportJson}\n\`\`\`` : "\n\nIf no report JSON is provided, call patchdrill_scan first.";
  return `${task}

Audience: ${audience ?? "code reviewer"}

Rules:
- Treat PatchDrill as the source of truth for gate status, risk score, findings, command text, and evidence verification.
- Do not invent findings or claim a command was run unless commandResults or verification evidence says it ran.
- Separate deterministic PatchDrill facts from your interpretation.
- Preserve exact command strings when recommending verification.
- If the gate fails, explain the smallest concrete evidence needed before merge.${reportSection}`;
}

const localeSchema = z.enum(LOCALES);
const severitySchema = z.enum(severityValues);

const commonScanInputShape = {
  cwd: z.string().optional().describe("Repository path to scan. Defaults to the MCP server workspace root and must stay inside it unless explicitly allowed."),
  base: z.string().optional().describe("Git base ref, for example origin/main."),
  head: z.string().optional().describe("Git head ref. Defaults to HEAD."),
  configPath: z.string().optional().describe("Repository-relative PatchDrill policy file path."),
  baselinePath: z.string().optional().describe("Repository-relative previous PatchDrill JSON report for risk-delta comparison."),
  locale: localeSchema.optional().describe("Human-facing report locale."),
  failOn: severitySchema.optional().describe("Gate fails when a finding has this severity or higher."),
  maxRisk: z.number().int().min(0).max(100).optional().describe("Gate fails when risk score is above this threshold."),
  maxRiskDelta: z.number().int().min(0).max(100).optional().describe("Gate fails when baseline risk delta is above this threshold."),
  maxFindings: z.number().int().min(1).max(50).optional().describe("Maximum findings to copy into the topFindings summary.")
};

const proofPackInputShape = {
  ...commonScanInputShape,
  outputDirectory: z
    .string()
    .optional()
    .describe("Repository-relative output directory for Proof Pack artifacts. Defaults to .patchdrill/mcp and cannot escape the repository root."),
  prefix: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional()
    .describe("Filename prefix for generated Proof Pack artifacts. Defaults to patchdrill.")
};

const runVerificationInputShape = {
  ...proofPackInputShape,
  allowCommandExecution: z.boolean().optional().describe("Must be true. This prevents accidental execution by model-controlled MCP calls."),
  runOptional: z.boolean().optional().describe("Also run optional command plans."),
  maxOutputChars: z.number().int().positive().optional().describe("Keep the last n characters of each command output stream."),
  commandTimeoutMs: z.number().int().positive().optional().describe("Stop each verification command after n milliseconds.")
};

const cwdOnlyInputShape = {
  cwd: commonScanInputShape.cwd
};

const evidenceInputShape = {
  cwd: commonScanInputShape.cwd,
  evidencePath: z.string().describe("Repository-relative evidence manifest path.")
};

const promptArgsShape = {
  reportJson: z.string().optional().describe("PatchDrill JSON report. If omitted, the model should call patchdrill_scan first."),
  audience: z.string().optional().describe("Audience for the explanation, for example reviewer, maintainer, release manager, or security reviewer.")
};

const toolOutputShape = {
  ok: z.boolean(),
  error: z.string().optional(),
  root: z.string().optional(),
  text: z.string().optional(),
  summary: z.any().optional(),
  gate: z.any().optional(),
  verification: z.any().optional(),
  topFindings: z.any().optional(),
  requiredCommands: z.any().optional(),
  optionalCommands: z.any().optional(),
  artifactPaths: z.any().optional(),
  evidenceVerification: z.any().optional(),
  report: z.any().optional(),
  checks: z.any().optional(),
  suggestedCommands: z.any().optional(),
  projectSignals: z.any().optional()
};

const toolOutputSchema = z.object(toolOutputShape).passthrough();
