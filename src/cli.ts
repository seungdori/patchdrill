#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoReport, demoScenarioNames, isDemoScenario, type DemoScenario } from "./demo.js";
import { formatEvidenceVerification, renderEvidenceManifest, verifyEvidenceManifest, type EvidenceArtifactKind, type RenderedEvidenceArtifact } from "./evidence.js";
import { gitRoot } from "./git.js";
import { isPolicyPackName, policyPackNames, writeGitHubWorkflow, writePolicyFile, type PolicyPackName } from "./init.js";
import { renderGitHubAnnotations, renderHtml, renderMarkdown, renderSarif, renderSummaryMarkdown, shouldFail, type GateOptions } from "./report.js";
import { isSchemaName, readSchema, schemaNames } from "./schema.js";
import { scan } from "./scan.js";
import type { PatchReport, Severity } from "./types.js";

const severities: Severity[] = ["info", "low", "medium", "high", "critical"];

export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean | string[]>;
  positionals: string[];
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.command;

  if (parsed.flags.help || command === "help") {
    printHelp();
    return;
  }
  if (parsed.flags.version) {
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
  if (command === "evidence") {
    evidenceCommand(parsed);
    return;
  }
  if (command === "init") {
    initCommand(parsed);
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
  if (command === "verify") {
    verifyCommand(parsed);
    return;
  }

  throw new Error(`Unknown command "${command}". Run patchdrill --help.`);
}

async function scanCommand(parsed: ParsedArgs): Promise<void> {
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
  const run = Boolean(parsed.flags.run);
  const runOptional = Boolean(parsed.flags["run-optional"]);
  const cliFailOn = cliFailOnValue ? readSeverity(cliFailOnValue, "critical") : undefined;
  const cliMaxRisk = cliMaxRiskValue ? readMaxRisk(cliMaxRiskValue) : undefined;
  const cliMaxRiskDelta = cliMaxRiskDeltaValue ? readMaxRiskDelta(cliMaxRiskDeltaValue) : undefined;
  const cliMaxOutputChars = cliMaxOutputCharsValue ? readPositiveInteger(cliMaxOutputCharsValue, "max output chars") : undefined;
  const cliCommandTimeoutMs = cliCommandTimeoutMsValue ? readPositiveInteger(cliCommandTimeoutMsValue, "command timeout ms") : undefined;
  if (runOptional && !run) {
    throw new Error("--run-optional requires --run.");
  }
  const report = await scan({
    cwd: process.cwd(),
    ...(base ? { base } : {}),
    ...(head ? { head } : {}),
    ...(configPath ? { configPath } : {}),
    ...(baselinePath ? { baselinePath } : {}),
    ...(evidencePath ? { evidencePath } : {}),
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
  if (!parsed.flags.quiet) {
    console.log(renderConsoleSummary(report, gateOptions));
    if (!parsed.flags.markdown) {
      console.log("");
      console.log(renderMarkdown(report));
    }
  }
  if (parsed.flags["github-annotations"]) {
    const annotations = renderGitHubAnnotations(report).trimEnd();
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
  const reports = jsonPaths.map((path) => JSON.parse(readFileSync(path, "utf8")) as PatchReport);
  const report = reports[reports.length - 1];
  if (!report) throw new Error("dashboard requires at least one JSON report.");
  const resolved = resolve(process.cwd(), output);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, renderHtml(report, reports.length > 1 ? { history: reports } : undefined), "utf8");
  console.log(`Wrote ${output}`);
}

export function demoCommand(parsed: ParsedArgs): void {
  const scenario = readDemoScenario(flagString(parsed, "scenario"));
  const report = createDemoReport(scenario);
  const output = flagString(parsed, "output");
  if (!output) {
    console.log(renderMarkdown(report).trimEnd());
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
  writeFileSync(files.summaryMarkdown, renderSummaryMarkdown(report), "utf8");
  writeFileSync(files.markdown, renderMarkdown(report), "utf8");
  writeFileSync(files.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(files.sarif, renderSarif(report), "utf8");
  writeFileSync(files.html, renderHtml(report), "utf8");

  console.log(`Wrote demo artifacts to ${output}`);
  console.log(`- ${files.summaryMarkdown}`);
  console.log(`- ${files.markdown}`);
  console.log(`- ${files.json}`);
  console.log(`- ${files.sarif}`);
  console.log(`- ${files.html}`);
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

  const reportJson = readFileSync(reportPath, "utf8");
  const report = JSON.parse(reportJson) as PatchReport;
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

function initCommand(parsed: ParsedArgs): void {
  const root = gitRoot(process.cwd());
  const policyPack = readPolicyPack(flagString(parsed, "policy-pack"));
  const path = writeGitHubWorkflow(root, Boolean(parsed.flags.force));
  console.log(`Created ${path}`);
  if (parsed.flags.policy || parsed.flags["policy-pack"]) {
    const policyPath = writePolicyFile(root, Boolean(parsed.flags.force), policyPack);
    console.log(`Created ${policyPath}`);
  }
}

function explainCommand(): void {
  console.log(`PatchDrill turns a git diff into a verification drill:

1. Detect changed files from git.
2. Discover repo ecosystems from manifests.
3. Infer the commands that should prove the patch.
4. Score risk from changed areas, dependency files, infra, secrets, size, and command results.
5. Emit Markdown, JSON, SARIF, static HTML, and verifiable evidence artifacts for PR review or CI storage.

Typical use:
  patchdrill scan --base origin/main --run --evidence patchdrill-evidence.json --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --html patchdrill-dashboard.html --fail-on high --max-risk 69
`);
}

function schemaCommand(parsed: ParsedArgs): void {
  const requested = parsed.positionals[0];
  if (parsed.flags.list || requested === undefined) {
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
  if (!parsed.flags.quiet) {
    console.log(formatEvidenceVerification(result));
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function renderConsoleSummary(report: Awaited<ReturnType<typeof scan>>, gateOptions: GateOptions): string {
  const required = report.commandPlan.filter((command) => command.required);
  const optional = report.commandPlan.filter((command) => !command.required);
  const gateStatus = shouldFail(report, gateOptions) ? "FAIL" : "PASS";
  const lines = [
    `PatchDrill Gate ${gateStatus} - assessment ${report.summary.status.toUpperCase()}, risk ${report.summary.riskScore}/100, confidence ${report.summary.confidenceScore}/100`,
    `Gate policy: fail-on ${gateOptions.failOn}, max-risk ${gateOptions.maxRisk}${gateOptions.maxRiskDelta !== undefined ? `, max-risk-delta ${gateOptions.maxRiskDelta}` : ""}`,
    `Changed files: ${report.summary.changedFileCount}, +${report.summary.additions}/-${report.summary.deletions}`,
    `Required commands: ${required.length}, optional commands: ${optional.length}${report.commandResults.length > 0 ? `, failed: ${report.summary.failedCommandCount}` : ""}`,
    `Added lines inspected: ${report.addedLines}`
  ];
  if (report.findings.length > 0) {
    lines.push("Top findings:");
    for (const finding of report.findings.slice(0, 5)) {
      lines.push(`- [${finding.severity}] ${finding.title}${finding.file ? ` (${finding.file})` : ""}`);
    }
  }
  if (required.length > 0 && report.commandResults.length === 0) {
    lines.push("Run with --run to execute required verification commands. Add --run-optional to include optional checks.");
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
      if (inlineValue !== undefined) {
        addFlag(flags, key, inlineValue);
      } else {
        const next = args[index + 1];
        if (next && !next.startsWith("-") && takesValue(key)) {
          addFlag(flags, key, next);
          index += 1;
        } else {
          addFlag(flags, key, true);
        }
      }
      continue;
    }
    if (!arg.startsWith("-") && command === "scan" && ["scan", "dashboard", "demo", "evidence", "init", "explain", "schema", "verify", "help"].includes(arg)) {
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
    "output"
  ].includes(flag);
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

function readVersion(): string {
  const packagePath = join(new URL("..", import.meta.url).pathname, "package.json");
  if (!existsSync(packagePath)) return "0.1.0";
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
    return parsed.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function printHelp(): void {
  console.log(`PatchDrill - evidence-first verification for AI-era patches

Usage:
  patchdrill scan [options]
  patchdrill dashboard --json <report.json> [--json <report.json>...] [--output <dashboard.html>]
  patchdrill demo [--scenario <name>] [--output <directory>]
  patchdrill evidence --json <report.json> --evidence <evidence.json> [artifact options]
  patchdrill init [--force] [--policy] [--policy-pack <name>]
  patchdrill explain
  patchdrill schema [policy|report|evidence] [--output <path>]
  patchdrill verify --evidence <patchdrill-evidence.json>

Options:
  --base <ref>        Compare against a base ref, for example origin/main
  --head <ref>        Head ref when using --base, default HEAD
  --config <path>     Read policy from .patchdrill.yml/json or a specific path
  --baseline <path>   Compare against a previous PatchDrill JSON report
  --evidence <path>   Write an audit evidence manifest during scan/evidence, or select one for verify
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
  --list              List schemas when used with schema
  --output <path>     Write a schema/dashboard file or demo artifact directory
  --version           Print version
  --help              Print help
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
