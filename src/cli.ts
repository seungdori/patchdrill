#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitRoot } from "./git.js";
import { isPolicyPackName, policyPackNames, writeGitHubWorkflow, writePolicyFile, type PolicyPackName } from "./init.js";
import { renderHtml, renderMarkdown, shouldFail, type GateOptions } from "./report.js";
import { isSchemaName, readSchema, schemaNames } from "./schema.js";
import { scan } from "./scan.js";
import type { PatchReport, Severity } from "./types.js";

const severities: Severity[] = ["info", "low", "medium", "high", "critical"];

export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
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

  throw new Error(`Unknown command "${command}". Run patchdrill --help.`);
}

async function scanCommand(parsed: ParsedArgs): Promise<void> {
  const cliFailOn = typeof parsed.flags["fail-on"] === "string" ? readSeverity(parsed.flags["fail-on"], "critical") : undefined;
  const cliMaxRisk = typeof parsed.flags["max-risk"] === "string" ? readMaxRisk(parsed.flags["max-risk"]) : undefined;
  const cliMaxRiskDelta = typeof parsed.flags["max-risk-delta"] === "string" ? readMaxRiskDelta(parsed.flags["max-risk-delta"]) : undefined;
  const cliMaxOutputChars = typeof parsed.flags["max-output-chars"] === "string" ? readPositiveInteger(parsed.flags["max-output-chars"], "max output chars") : undefined;
  const cliCommandTimeoutMs = typeof parsed.flags["command-timeout-ms"] === "string" ? readPositiveInteger(parsed.flags["command-timeout-ms"], "command timeout ms") : undefined;
  const report = await scan({
    cwd: process.cwd(),
    ...(typeof parsed.flags.base === "string" ? { base: parsed.flags.base } : {}),
    ...(typeof parsed.flags.head === "string" ? { head: parsed.flags.head } : {}),
    ...(typeof parsed.flags.config === "string" ? { configPath: parsed.flags.config } : {}),
    ...(typeof parsed.flags.baseline === "string" ? { baselinePath: parsed.flags.baseline } : {}),
    run: Boolean(parsed.flags.run),
    ...(cliFailOn ? { failOn: cliFailOn } : {}),
    ...(typeof parsed.flags.markdown === "string" ? { markdownPath: parsed.flags.markdown } : {}),
    ...(typeof parsed.flags.json === "string" ? { jsonPath: parsed.flags.json } : {}),
    ...(typeof parsed.flags.sarif === "string" ? { sarifPath: parsed.flags.sarif } : {}),
    ...(typeof parsed.flags.html === "string" ? { htmlPath: parsed.flags.html } : {}),
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

  if (shouldFail(report, gateOptions)) {
    process.exitCode = 1;
  }
}

export function dashboardCommand(parsed: ParsedArgs): void {
  if (typeof parsed.flags.json !== "string") {
    throw new Error("dashboard requires --json <report.json>.");
  }

  const output = typeof parsed.flags.output === "string" ? parsed.flags.output : "patchdrill-dashboard.html";
  const report = JSON.parse(readFileSync(parsed.flags.json, "utf8")) as PatchReport;
  const resolved = resolve(process.cwd(), output);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, renderHtml(report), "utf8");
  console.log(`Wrote ${output}`);
}

function initCommand(parsed: ParsedArgs): void {
  const root = gitRoot(process.cwd());
  const policyPack = readPolicyPack(parsed.flags["policy-pack"]);
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
5. Emit Markdown, JSON, SARIF, and static HTML evidence for PR review or CI artifacts.

Typical use:
  patchdrill scan --base origin/main --run --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --html patchdrill-dashboard.html --fail-on high --max-risk 69
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
  if (typeof parsed.flags.output === "string") {
    writeFileSync(parsed.flags.output, schema, "utf8");
    console.log(`Wrote ${parsed.flags.output}`);
    return;
  }

  console.log(schema.trimEnd());
}

function renderConsoleSummary(report: Awaited<ReturnType<typeof scan>>, gateOptions: GateOptions): string {
  const required = report.commandPlan.filter((command) => command.required);
  const gateStatus = shouldFail(report, gateOptions) ? "FAIL" : "PASS";
  const lines = [
    `PatchDrill Gate ${gateStatus} - assessment ${report.summary.status.toUpperCase()}, risk ${report.summary.riskScore}/100, confidence ${report.summary.confidenceScore}/100`,
    `Gate policy: fail-on ${gateOptions.failOn}, max-risk ${gateOptions.maxRisk}${gateOptions.maxRiskDelta !== undefined ? `, max-risk-delta ${gateOptions.maxRiskDelta}` : ""}`,
    `Changed files: ${report.summary.changedFileCount}, +${report.summary.additions}/-${report.summary.deletions}`,
    `Required commands: ${required.length}${report.commandResults.length > 0 ? `, failed: ${report.summary.failedCommandCount}` : ""}`,
    `Added lines inspected: ${report.addedLines}`
  ];
  if (report.findings.length > 0) {
    lines.push("Top findings:");
    for (const finding of report.findings.slice(0, 5)) {
      lines.push(`- [${finding.severity}] ${finding.title}${finding.file ? ` (${finding.file})` : ""}`);
    }
  }
  if (required.length > 0 && report.commandResults.length === 0) {
    lines.push("Run with --run to execute required verification commands.");
  }
  return lines.join("\n");
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
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
        flags[key] = inlineValue;
      } else {
        const next = args[index + 1];
        if (next && !next.startsWith("-") && takesValue(key)) {
          flags[key] = next;
          index += 1;
        } else {
          flags[key] = true;
        }
      }
      continue;
    }
    if (!arg.startsWith("-") && command === "scan" && ["scan", "dashboard", "init", "explain", "schema", "help"].includes(arg)) {
      command = arg;
      continue;
    }
    positionals.push(arg);
  }

  return { command, flags, positionals };
}

function takesValue(flag: string): boolean {
  return [
    "base",
    "head",
    "config",
    "baseline",
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
  patchdrill dashboard --json <report.json> [--output <dashboard.html>]
  patchdrill init [--force] [--policy] [--policy-pack <name>]
  patchdrill explain
  patchdrill schema [policy|report] [--output <path>]

Options:
  --base <ref>        Compare against a base ref, for example origin/main
  --head <ref>        Head ref when using --base, default HEAD
  --config <path>     Read policy from .patchdrill.yml/json or a specific path
  --baseline <path>   Compare against a previous PatchDrill JSON report
  --run               Execute required inferred verification commands
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
  --list              List schemas when used with schema
  --output <path>     Write a schema or dashboard to a file
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
