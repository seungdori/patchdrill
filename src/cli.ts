#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gitRoot } from "./git.js";
import { writeGitHubWorkflow } from "./init.js";
import { renderMarkdown, shouldFail, type GateOptions } from "./report.js";
import { isSchemaName, readSchema, schemaNames } from "./schema.js";
import { scan } from "./scan.js";
import type { Severity } from "./types.js";

const severities: Severity[] = ["info", "low", "medium", "high", "critical"];

interface ParsedArgs {
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
    ...(typeof parsed.flags.sarif === "string" ? { sarifPath: parsed.flags.sarif } : {})
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

function initCommand(parsed: ParsedArgs): void {
  const root = gitRoot(process.cwd());
  const path = writeGitHubWorkflow(root, Boolean(parsed.flags.force));
  console.log(`Created ${path}`);
}

function explainCommand(): void {
  console.log(`PatchDrill turns a git diff into a verification drill:

1. Detect changed files from git.
2. Discover repo ecosystems from manifests.
3. Infer the commands that should prove the patch.
4. Score risk from changed areas, dependency files, infra, secrets, size, and command results.
5. Emit Markdown, JSON, and SARIF evidence for PR review or CI artifacts.

Typical use:
  patchdrill scan --base origin/main --run --markdown patchdrill-report.md --json patchdrill-report.json --sarif patchdrill.sarif --fail-on high --max-risk 69
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

function parseArgs(args: string[]): ParsedArgs {
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
    if (!arg.startsWith("-") && command === "scan" && ["scan", "init", "explain", "schema", "help"].includes(arg)) {
      command = arg;
      continue;
    }
    positionals.push(arg);
  }

  return { command, flags, positionals };
}

function takesValue(flag: string): boolean {
  return ["base", "head", "config", "baseline", "markdown", "json", "sarif", "fail-on", "max-risk", "max-risk-delta", "output"].includes(flag);
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
  patchdrill init [--force]
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
  --fail-on <level>   Fail when findings meet severity: info, low, medium, high, critical
  --max-risk <score>  Fail when risk score is above 0-100 threshold, default 69
  --max-risk-delta <score>
                      Fail when baseline risk increase is above this threshold
  --quiet             Only use exit code, no console report
  --list              List schemas when used with schema
  --output <path>     Write a schema to a file when used with schema
  --version           Print version
  --help              Print help
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`patchdrill: ${message}`);
  process.exitCode = 1;
});
