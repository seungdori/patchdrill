#!/usr/bin/env node
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoReport, demoScenarioNames, isDemoScenario, type DemoScenario } from "./demo.js";
import { formatEvidenceVerification, renderEvidenceManifest, verifyEvidenceManifest, type EvidenceArtifactKind, type RenderedEvidenceArtifact } from "./evidence.js";
import { gitRoot } from "./git.js";
import { isLocale, LOCALES, resolveLocale, t, type Locale } from "./i18n.js";
import { isPolicyPackName, policyPackNames, writeGitHubWorkflow, writeOnboardingGuide, writePolicyFile, type PolicyPackName } from "./init.js";
import { inspectDoctor, renderDoctor } from "./doctor.js";
import { startPatchDrillMcpServer } from "./mcp.js";
import { checkReleaseReadiness, createReleaseReadinessReport, renderReleaseReadiness, summarizeReleaseReadiness } from "./release-readiness.js";
import { reportContractFailures } from "./report-contract.js";
import { renderGitHubAnnotations, renderHtml, renderMarkdown, renderSarif, renderSummaryMarkdown, shouldFail, verificationEvidencePhrase, type GateOptions } from "./report.js";
import { isSchemaName, readSchema, schemaNames } from "./schema.js";
import { scan } from "./scan.js";
import type { PatchReport, Severity } from "./types.js";
import { readVersion } from "./version.js";
import { verificationSummary } from "./verification.js";

const severities: Severity[] = ["info", "low", "medium", "high", "critical"];

export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean | string[]>;
  positionals: string[];
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.command;

  if (flagBoolean(parsed, "help") || command === "help") {
    printHelp();
    return;
  }
  if (flagBoolean(parsed, "version")) {
    console.log(readVersion());
    return;
  }

  if (command === "scan") {
    await scanCommand(parsed);
    return;
  }
  if (command === "dashboard") {
    dashboardCommand(parsed);
    return;
  }
  if (command === "demo") {
    demoCommand(parsed);
    return;
  }
  if (command === "doctor") {
    doctorCommand(parsed);
    return;
  }
  if (command === "evidence") {
    evidenceCommand(parsed);
    return;
  }
  if (command === "init") {
    initCommand(parsed);
    return;
  }
  if (command === "mcp") {
    await mcpCommand(parsed);
    return;
  }
  if (command === "explain") {
    explainCommand();
    return;
  }
  if (command === "schema") {
    schemaCommand(parsed);
    return;
  }
  if (command === "release-check") {
    releaseCheckCommand(parsed);
    return;
  }
  if (command === "verify") {
    verifyCommand(parsed);
    return;
  }

  throw new Error(`Unknown command "${command}". Run patchdrill --help.`);
}

export async function scanCommand(parsed: ParsedArgs): Promise<void> {
  const cliFailOnValue = flagString(parsed, "fail-on");
  const cliMaxRiskValue = flagString(parsed, "max-risk");
  const cliMaxRiskDeltaValue = flagString(parsed, "max-risk-delta");
  const cliMaxOutputCharsValue = flagString(parsed, "max-output-chars");
  const cliCommandTimeoutMsValue = flagString(parsed, "command-timeout-ms");
  const base = flagString(parsed, "base");
  const head = flagString(parsed, "head");
  const configPath = flagString(parsed, "config");
  const baselinePath = flagString(parsed, "baseline");
  const evidencePath = flagString(parsed, "evidence");
  const summaryMarkdownPath = flagString(parsed, "summary-markdown");
  const markdownPath = flagString(parsed, "markdown");
  const jsonPath = flagString(parsed, "json");
  const sarifPath = flagString(parsed, "sarif");
  const htmlPath = flagString(parsed, "html");
  const run = flagBoolean(parsed, "run");
  const runOptional = flagBoolean(parsed, "run-optional");
  const cliFailOn = cliFailOnValue ? readSeverity(cliFailOnValue, "critical") : undefined;
  const cliMaxRisk = cliMaxRiskValue ? readMaxRisk(cliMaxRiskValue) : undefined;
  const cliMaxRiskDelta = cliMaxRiskDeltaValue ? readMaxRiskDelta(cliMaxRiskDeltaValue) : undefined;
  const cliMaxOutputChars = cliMaxOutputCharsValue ? readPositiveInteger(cliMaxOutputCharsValue, "max output chars") : undefined;
  const cliCommandTimeoutMs = cliCommandTimeoutMsValue ? readPositiveInteger(cliCommandTimeoutMsValue, "command timeout ms") : undefined;
  if (runOptional && !run) {
    throw new Error("--run-optional requires --run.");
  }
  if (evidencePath && !jsonPath) {
    throw new Error("--evidence requires --json so the evidence manifest can verify the JSON report contract.");
  }
  if (cliMaxRiskDelta !== undefined && !baselinePath) {
    throw new Error("--max-risk-delta requires --baseline so the risk delta gate has a previous report to compare against.");
  }
  const locale = readLocale(parsed, true);
  const report = await scan({
    cwd: process.cwd(),
    ...(base ? { base } : {}),
    ...(head ? { head } : {}),
    ...(configPath ? { configPath } : {}),
    ...(baselinePath ? { baselinePath } : {}),
    ...(evidencePath ? { evidencePath } : {}),
    locale,
    run,
    ...(runOptional ? { runOptional: true } : {}),
    ...(cliFailOn ? { failOn: cliFailOn } : {}),
    ...(summaryMarkdownPath ? { summaryMarkdownPath } : {}),
    ...(markdownPath ? { markdownPath } : {}),
    ...(jsonPath ? { jsonPath } : {}),
    ...(sarifPath ? { sarifPath } : {}),
    ...(htmlPath ? { htmlPath } : {}),
    ...(cliMaxOutputChars !== undefined ? { maxOutputChars: cliMaxOutputChars } : {}),
    ...(cliCommandTimeoutMs !== undefined ? { commandTimeoutMs: cliCommandTimeoutMs } : {})
  });

  const gateOptions = {
    failOn: cliFailOn ?? report.policy?.failOn ?? "critical",
    maxRisk: cliMaxRisk ?? report.policy?.maxRisk ?? 69,
    ...(cliMaxRiskDelta !== undefined ? { maxRiskDelta: cliMaxRiskDelta } : {})
  };
  if (!flagBoolean(parsed, "quiet")) {
    console.log(renderConsoleSummary(report, gateOptions, locale));
    if (!markdownPath) {
      console.log("");
      console.log(renderMarkdown(report, locale));
    }
  }
  if (flagBoolean(parsed, "github-annotations")) {
    const annotations = renderGitHubAnnotations(report, locale).trimEnd();
    if (annotations) console.log(annotations);
  }

  if (shouldFail(report, gateOptions)) {
    process.exitCode = 1;
  }
}

export function dashboardCommand(parsed: ParsedArgs): void {
  const jsonPaths = flagStrings(parsed, "json");
  if (jsonPaths.length === 0) {
    throw new Error("dashboard requires --json <report.json>.");
  }

  const output = flagString(parsed, "output") ?? "patchdrill-dashboard.html";
  const locale = readLocale(parsed);
  const reports = jsonPaths.map((path) => readSavedReport(path).report);
  const report = reports[reports.length - 1];
  if (!report) throw new Error("dashboard requires at least one JSON report.");
  const resolved = resolve(process.cwd(), output);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, renderHtml(report, { ...(reports.length > 1 ? { history: reports } : {}), locale }), "utf8");
  console.log(`Wrote ${output}`);
}

export function demoCommand(parsed: ParsedArgs): void {
  const scenario = readDemoScenario(flagString(parsed, "scenario"));
  const report = createDemoReport(scenario);
  const output = flagString(parsed, "output");
  const locale = readLocale(parsed);
  if (!output) {
    console.log(renderMarkdown(report, locale).trimEnd());
    return;
  }

  const outputDir = resolve(process.cwd(), output);
  mkdirSync(outputDir, { recursive: true });
  const files = {
    summaryMarkdown: join(outputDir, "patchdrill-demo-summary.md"),
    markdown: join(outputDir, "patchdrill-demo.md"),
    json: join(outputDir, "patchdrill-demo.json"),
    sarif: join(outputDir, "patchdrill-demo.sarif"),
    html: join(outputDir, "patchdrill-demo.html")
  };
  writeFileSync(files.summaryMarkdown, renderSummaryMarkdown(report, locale), "utf8");
  writeFileSync(files.markdown, renderMarkdown(report, locale), "utf8");
  writeFileSync(files.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(files.sarif, renderSarif(report), "utf8");
  writeFileSync(files.html, renderHtml(report, { locale }), "utf8");

  console.log(`Wrote demo artifacts to ${output}`);
  console.log(`- ${files.summaryMarkdown}`);
  console.log(`- ${files.markdown}`);
  console.log(`- ${files.json}`);
  console.log(`- ${files.sarif}`);
  console.log(`- ${files.html}`);
}

export function doctorCommand(parsed: ParsedArgs = { command: "doctor", flags: {}, positionals: [] }): void {
  const root = gitRoot(process.cwd());
  const report = inspectDoctor(root);
  if (readOutputFormat(parsed) === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(renderDoctor(report).trimEnd());
}

export function evidenceCommand(parsed: ParsedArgs): void {
  const reportPath = flagString(parsed, "json");
  const evidencePath = flagString(parsed, "evidence") ?? flagString(parsed, "output");
  if (!reportPath) {
    throw new Error("evidence requires --json <patchdrill-report.json>.");
  }
  if (!evidencePath) {
    throw new Error("evidence requires --evidence <patchdrill-evidence.json>.");
  }

  const { report, contents: reportJson } = readSavedReport(reportPath);
  const artifacts: RenderedEvidenceArtifact[] = [
    ...optionalEvidenceArtifact("summary-markdown", flagString(parsed, "summary-markdown")),
    ...optionalEvidenceArtifact("markdown", flagString(parsed, "markdown")),
    { kind: "json", path: reportPath, contents: reportJson },
    ...optionalEvidenceArtifact("sarif", flagString(parsed, "sarif")),
    ...optionalEvidenceArtifact("html", flagString(parsed, "html"))
  ];
  const resolved = resolve(process.cwd(), evidencePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, renderEvidenceManifest(report, artifacts, report.root || process.cwd(), reportJson), "utf8");
  console.log(`Wrote ${evidencePath}`);
}

function readSavedReport(path: string): { report: PatchReport; contents: string } {
  const contents = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse JSON report at ${path}: ${detail}`, { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new Error(`JSON report at ${path} must be an object; got ${describeJsonValue(parsed)}.`);
  }
  const failures = reportContractFailures(parsed);
  if (failures.length > 0) {
    throw new Error(`JSON report contract failed for ${path}: ${failures.join("; ")}`);
  }
  return { report: parsed as unknown as PatchReport, contents };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeJsonValue(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function initCommand(parsed: ParsedArgs): void {
  const root = gitRoot(process.cwd());
  const policyPack = readPolicyPack(flagString(parsed, "policy-pack"));
  const force = flagBoolean(parsed, "force");
  const policyRequested = flagBoolean(parsed, "policy") || parsed.flags["policy-pack"] !== undefined;
  const path = writeGitHubWorkflow(root, force);
  console.log(`Created ${path}`);
  if (policyRequested) {
    const policyPath = writePolicyFile(root, force, policyPack);
    console.log(`Created ${policyPath}`);
  }
  const guidePath = writeOnboardingGuide(root, force, { policyPack, policyCreated: policyRequested });
  console.log(`Created ${guidePath}`);
}

async function mcpCommand(parsed: ParsedArgs): Promise<void> {
  const transport = flagString(parsed, "transport") ?? "stdio";
  const workspaceRoot = flagString(parsed, "workspace-root") ?? process.cwd();
  if (transport !== "stdio") {
    throw new Error(`Unsupported MCP transport "${transport}". PatchDrill currently supports stdio.`);
  }
  await startPatchDrillMcpServer({
    workspaceRoot,
    allowAnyCwd: process.env.PATCHDRILL_MCP_ALLOW_ANY_CWD === "1"
  });
}

export function explainCommand(): void {
  console.log(renderExplainText());
}

export function renderExplainText(): string {
  return `PatchDrill is the deterministic proof layer between code review and CI.

PatchDrill is not an AI PR reviewer.

AI reviewers answer: "Does this diff look right?"
PatchDrill answers: "What deterministic proof should exist before merge?"

What PatchDrill does:
1. Reads changed files and added lines from git.
2. Detects repository ecosystems, workspaces, owners, dependencies, package scripts, and workflow trust boundaries.
3. Infers required and optional verification commands from the patch.
4. Scores risk with human-readable findings where every score increase maps to a report row.
5. Emits a Proof Pack: Markdown, JSON, SARIF, static HTML, PR-comment summaries, and verifiable evidence manifests.

What makes it different:
- No model call is required; the same diff produces the same plan and findings.
- scan does not mutate the repository or run commands unless --run is set.
- --run executes inferred required checks; --run-optional explicitly opts into optional checks.
- Proof Pack artifacts are meant for CI gates, bots, auditors, reviewers, and model-assisted review.
- You can run PatchDrill before handing the report to a human or a frontier model.

Try it without a repository:
  patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo

Typical CI/local use:
  patchdrill scan --base origin/main --run --evidence patchdrill-evidence.json --summary-markdown patchdrill-summary.md --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --html patchdrill-dashboard.html --fail-on high --max-risk 69`;
}

function schemaCommand(parsed: ParsedArgs): void {
  const requested = parsed.positionals[0];
  if (flagBoolean(parsed, "list") || requested === undefined) {
    console.log(schemaNames.join("\n"));
    return;
  }
  if (!isSchemaName(requested)) {
    throw new Error(`Unknown schema "${requested}". Expected one of ${schemaNames.join(", ")}.`);
  }

  const schema = readSchema(requested);
  const output = flagString(parsed, "output");
  if (output) {
    writeFileSync(output, schema, "utf8");
    console.log(`Wrote ${output}`);
    return;
  }

  console.log(schema.trimEnd());
}

function verifyCommand(parsed: ParsedArgs): void {
  const evidencePath = flagString(parsed, "evidence") ?? parsed.positionals[0];
  if (!evidencePath) {
    throw new Error("verify requires --evidence <patchdrill-evidence.json>.");
  }
  const result = verifyEvidenceManifest(evidencePath, process.cwd());
  if (!flagBoolean(parsed, "quiet")) {
    console.log(formatEvidenceVerification(result));
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

export function releaseCheckCommand(parsed: ParsedArgs = { command: "release-check", flags: {}, positionals: [] }): void {
  const root = gitRoot(process.cwd());
  const checks = checkReleaseReadiness(root);
  const summary = summarizeReleaseReadiness(checks);
  if (readOutputFormat(parsed) === "json") {
    console.log(JSON.stringify(createReleaseReadinessReport(checks), null, 2));
  } else {
    console.log(renderReleaseReadiness(checks).trimEnd());
  }
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

export function renderConsoleSummary(report: Awaited<ReturnType<typeof scan>>, gateOptions: GateOptions, locale: Locale = "en"): string {
  const tr = (text: string): string => t(locale, text);
  const required = report.commandPlan.filter((command) => command.required);
  const optional = report.commandPlan.filter((command) => !command.required);
  const verification = verificationSummary(report);
  const gateStatus = shouldFail(report, gateOptions) ? "FAIL" : "PASS";
  const lines = [
    `${tr("PatchDrill Gate")} ${tr(gateStatus)} - ${tr("assessment")} ${tr(report.summary.status.toUpperCase())}, ${tr("risk")} ${report.summary.riskScore}/100, ${tr("confidence")} ${report.summary.confidenceScore}/100`,
    `${tr("Gate policy")}: ${tr("fail-on")} ${gateOptions.failOn}, ${tr("max-risk")} ${gateOptions.maxRisk}${gateOptions.maxRiskDelta !== undefined ? `, ${tr("max-risk-delta")} ${gateOptions.maxRiskDelta}` : ""}`,
    `${tr("Changed files")}: ${report.summary.changedFileCount}, +${report.summary.additions}/-${report.summary.deletions}`,
    `${tr("Required commands")}: ${required.length}, ${tr("optional commands")}: ${optional.length}`,
    `${tr("Verification evidence")}: ${verificationEvidencePhrase(verification, locale)}`,
    `${tr("Added lines inspected")}: ${report.addedLines}`
  ];
  if (report.findings.length > 0) {
    lines.push(`${tr("Top findings")}:`);
    for (const finding of report.findings.slice(0, 5)) {
      lines.push(`- [${tr(finding.severity)}] ${tr(finding.title)}${finding.file ? ` (${finding.file})` : ""}`);
    }
  }
  if (verification.missingRequired > 0) {
    lines.push(tr("Run with --run to execute required verification commands. Add --run-optional to include optional checks."));
  }
  return lines.join("\n");
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];
  let command = "scan";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg.startsWith("--")) {
      const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
      const key = rawKey ?? "";
      if (!key) continue;
      if (!isKnownFlag(key)) {
        throw new Error(`Unknown flag "--${key}". Run patchdrill --help.`);
      }
      if (inlineValue !== undefined) {
        addFlag(flags, key, isBooleanFlag(key) ? readBooleanFlag(inlineValue, key) : inlineValue);
      } else if (takesValue(key)) {
        const next = args[index + 1];
        if (next === undefined || next.startsWith("-")) {
          throw new Error(`Flag "--${key}" requires a value. Run patchdrill --help.`);
        }
        addFlag(flags, key, next);
        index += 1;
      } else {
        const next = args[index + 1];
        if (next && !next.startsWith("-") && isBooleanFlag(key) && isBooleanLiteral(next)) {
          addFlag(flags, key, readBooleanFlag(next, key));
          index += 1;
        } else {
          addFlag(flags, key, true);
        }
      }
      continue;
    }
    if (
      !arg.startsWith("-") &&
      command === "scan" &&
      ["scan", "dashboard", "demo", "doctor", "evidence", "init", "mcp", "explain", "release-check", "schema", "verify", "help"].includes(arg)
    ) {
      command = arg;
      continue;
    }
    positionals.push(arg);
  }

  return { command, flags, positionals };
}

function addFlag(flags: Record<string, string | boolean | string[]>, key: string, value: string | boolean): void {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = value;
    return;
  }
  const next = typeof value === "string" ? value : String(value);
  if (Array.isArray(existing)) {
    existing.push(next);
    return;
  }
  flags[key] = [typeof existing === "string" ? existing : String(existing), next];
}

function flagString(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.flags[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[value.length - 1];
  return undefined;
}

function flagStrings(parsed: ParsedArgs, key: string): string[] {
  const value = parsed.flags[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return [];
}

function flagBoolean(parsed: ParsedArgs, key: string): boolean {
  const value = parsed.flags[key];
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return readBooleanFlag(value, key);
  const last = value.at(-1);
  return last === undefined ? false : readBooleanFlag(last, key);
}

function takesValue(flag: string): boolean {
  return [
    "base",
    "head",
    "config",
    "baseline",
    "evidence",
    "summary-markdown",
    "markdown",
    "json",
    "sarif",
    "html",
    "fail-on",
    "max-risk",
    "max-risk-delta",
    "max-output-chars",
    "command-timeout-ms",
    "policy-pack",
    "scenario",
    "format",
    "output",
    "locale",
    "transport",
    "workspace-root"
  ].includes(flag);
}

function isBooleanFlag(flag: string): boolean {
  return ["help", "version", "quiet", "run", "run-optional", "github-annotations", "force", "policy", "list"].includes(flag);
}

function isKnownFlag(flag: string): boolean {
  return takesValue(flag) || isBooleanFlag(flag);
}

function isBooleanLiteral(value: string): boolean {
  return /^(true|false|1|0|yes|no|on|off)$/i.test(value);
}

function readBooleanFlag(value: string, flag: string): boolean {
  if (/^(true|1|yes|on)$/i.test(value)) return true;
  if (/^(false|0|no|off)$/i.test(value)) return false;
  throw new Error(`Invalid boolean value "${value}" for --${flag}. Expected true or false.`);
}

function readSeverity(value: string | boolean | undefined, fallback: Severity): Severity {
  if (typeof value !== "string") return fallback;
  if (!severities.includes(value as Severity)) {
    throw new Error(`Invalid severity "${value}". Expected one of ${severities.join(", ")}.`);
  }
  return value as Severity;
}

function readMaxRisk(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid max risk "${value}". Expected an integer from 0 to 100.`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Invalid max risk "${value}". Expected an integer from 0 to 100.`);
  }
  return parsed;
}

function readMaxRiskDelta(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid max risk delta "${value}". Expected an integer from 0 to 100.`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Invalid max risk delta "${value}". Expected an integer from 0 to 100.`);
  }
  return parsed;
}

function readPositiveInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label} "${value}". Expected a positive integer.`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label} "${value}". Expected a positive integer.`);
  }
  return parsed;
}

function readLocale(parsed: ParsedArgs, detectEnv = false): Locale {
  const explicit = flagString(parsed, "locale");
  if (explicit !== undefined && !isLocale(explicit)) {
    throw new Error(`Invalid locale "${explicit}". Expected one of ${LOCALES.join(", ")}.`);
  }
  // Only `scan` auto-detects the system locale (it analyzes the user's own repo).
  // `demo`/`dashboard` render fixed or saved artifacts and stay English unless an
  // explicit --locale is given, so sample output and fixtures are deterministic.
  return resolveLocale(detectEnv ? { explicit, env: process.env } : { explicit });
}

function readPolicyPack(value: string | boolean | undefined): PolicyPackName {
  if (value === undefined || value === false) return "default";
  if (typeof value !== "string") {
    throw new Error(`Invalid policy pack. Expected one of ${policyPackNames.join(", ")}.`);
  }
  if (!isPolicyPackName(value)) {
    throw new Error(`Invalid policy pack "${value}". Expected one of ${policyPackNames.join(", ")}.`);
  }
  return value;
}

function readOutputFormat(parsed: ParsedArgs): "text" | "json" {
  const format = flagString(parsed, "format") ?? "text";
  if (format !== "text" && format !== "json") {
    throw new Error(`Invalid output format "${format}". Expected text or json.`);
  }
  return format;
}

function optionalEvidenceArtifact(kind: EvidenceArtifactKind, path: string | undefined): RenderedEvidenceArtifact[] {
  return path ? [{ kind, path, contents: readFileSync(path, "utf8") }] : [];
}

function readDemoScenario(value: string | undefined): DemoScenario {
  if (value === undefined) return "review-ready";
  if (!isDemoScenario(value)) {
    throw new Error(`Invalid demo scenario "${value}". Expected one of ${demoScenarioNames.join(", ")}.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`PatchDrill - deterministic proof layer for AI-era patches

Usage:
  patchdrill scan [options]
  patchdrill dashboard --json <report.json> [--json <report.json>...] [--output <dashboard.html>]
  patchdrill demo [--scenario <name>] [--output <directory>]
  patchdrill doctor [--format text|json]
  patchdrill evidence --json <report.json> --evidence <evidence.json> [artifact options]
  patchdrill init [--force] [--policy] [--policy-pack <name>]
  patchdrill mcp [--transport stdio] [--workspace-root <path>]
  patchdrill explain
  patchdrill release-check [--format text|json]
  patchdrill schema [policy|report|evidence|doctor|release-check] [--output <path>]
  patchdrill verify --evidence <patchdrill-evidence.json>

First run:
  patchdrill explain
  patchdrill demo --scenario risky-agent-pr --output patchdrill-risky-demo
  patchdrill doctor
  patchdrill scan --base origin/main

Options:
  --base <ref>        Compare against a base ref, for example origin/main
  --head <ref>        Head ref when using --base, default HEAD
  --config <path>     Read policy from .patchdrill.yml/json or a specific path
  --baseline <path>   Compare against a previous PatchDrill JSON report
  --evidence <path>   Write a Proof Pack evidence manifest during scan/evidence, or select one for verify. scan --evidence requires --json
  --run               Execute required inferred verification commands
  --run-optional      With --run, also execute optional verification commands
  --github-annotations
                      Emit GitHub Actions log annotations for findings
  --summary-markdown <path>
                      Write a compact Markdown summary for PR comments or step summaries
  --markdown <path>   Write a Markdown report
  --json <path>       Write a JSON report
  --sarif <path>      Write a SARIF report for GitHub code scanning
  --html <path>       Write a self-contained static HTML dashboard
  --fail-on <level>   Fail when findings meet severity: info, low, medium, high, critical
  --max-risk <score>  Fail when risk score is above 0-100 threshold, default 69
  --max-risk-delta <score>
                      Fail when baseline risk increase is above this threshold
  --max-output-chars <n>
                      Keep the last n characters of each command output stream, default 20000
  --command-timeout-ms <n>
                      Stop each verification command after n milliseconds
  --quiet             Only use exit code, no console report
  --policy            Create .patchdrill.yml when used with init
  --policy-pack <name>
                      Starter policy pack for init --policy: ${policyPackNames.join(", ")}
  --scenario <name>   Demo scenario: ${demoScenarioNames.join(", ")}
  --format <format>   Output format for doctor and release-check: text, json
  --locale <lang>     Language for human-facing reports: ${LOCALES.join(", ")} (default: system locale, else en)
  --transport <name>  MCP transport for patchdrill mcp: stdio
  --workspace-root <path>
                      Workspace root for patchdrill mcp (default: current directory)
  --list              List schemas when used with schema
  --output <path>     Write a schema/dashboard file or demo artifact directory
  --version           Print version
  --help              Print help

Boolean flags accept explicit values: --run=false, --quiet=true, --github-annotations=off.
`);
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`patchdrill: ${message}`);
    process.exitCode = 1;
  });
}

function isCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === realpathSync(modulePath);
  } catch {
    return resolve(entry) === modulePath;
  }
}
