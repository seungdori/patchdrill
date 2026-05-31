#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gitRoot } from "./git.js";
import { writeGitHubWorkflow } from "./init.js";
import { renderMarkdown, shouldFail } from "./report.js";
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

  throw new Error(`Unknown command "${command}". Run patchdrill --help.`);
}

async function scanCommand(parsed: ParsedArgs): Promise<void> {
  const failOn = readSeverity(parsed.flags["fail-on"], "critical");
  const report = await scan({
    cwd: process.cwd(),
    ...(typeof parsed.flags.base === "string" ? { base: parsed.flags.base } : {}),
    ...(typeof parsed.flags.head === "string" ? { head: parsed.flags.head } : {}),
    run: Boolean(parsed.flags.run),
    failOn,
    ...(typeof parsed.flags.markdown === "string" ? { markdownPath: parsed.flags.markdown } : {}),
    ...(typeof parsed.flags.json === "string" ? { jsonPath: parsed.flags.json } : {})
  });

  if (!parsed.flags.quiet) {
    console.log(renderConsoleSummary(report));
    if (!parsed.flags.markdown) {
      console.log("");
      console.log(renderMarkdown(report));
    }
  }

  if (shouldFail(report, failOn)) {
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
5. Emit Markdown and JSON evidence for PR review or CI artifacts.

Typical use:
  patchdrill scan --base origin/main --run --markdown patchdrill-report.md --json patchdrill-report.json
`);
}

function renderConsoleSummary(report: Awaited<ReturnType<typeof scan>>): string {
  const required = report.commandPlan.filter((command) => command.required);
  const lines = [
    `PatchDrill ${report.summary.status.toUpperCase()} - risk ${report.summary.riskScore}/100, confidence ${report.summary.confidenceScore}/100`,
    `Changed files: ${report.summary.changedFileCount}, +${report.summary.additions}/-${report.summary.deletions}`,
    `Required commands: ${required.length}${report.commandResults.length > 0 ? `, failed: ${report.summary.failedCommandCount}` : ""}`
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
    if (!arg.startsWith("-") && command === "scan" && ["scan", "init", "explain", "help"].includes(arg)) {
      command = arg;
      continue;
    }
    positionals.push(arg);
  }

  return { command, flags, positionals };
}

function takesValue(flag: string): boolean {
  return ["base", "head", "markdown", "json", "fail-on"].includes(flag);
}

function readSeverity(value: string | boolean | undefined, fallback: Severity): Severity {
  if (typeof value !== "string") return fallback;
  if (!severities.includes(value as Severity)) {
    throw new Error(`Invalid severity "${value}". Expected one of ${severities.join(", ")}.`);
  }
  return value as Severity;
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

Options:
  --base <ref>        Compare against a base ref, for example origin/main
  --head <ref>        Head ref when using --base, default HEAD
  --run               Execute required inferred verification commands
  --markdown <path>   Write a Markdown report
  --json <path>       Write a JSON report
  --fail-on <level>   Fail when findings meet severity: info, low, medium, high, critical
  --quiet             Only use exit code, no console report
  --version           Print version
  --help              Print help
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`patchdrill: ${message}`);
  process.exitCode = 1;
});
