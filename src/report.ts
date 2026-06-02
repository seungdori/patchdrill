import type { PatchReport, Severity } from "./types.js";
import { formatVerificationStatus, verificationExecutions, verificationSummary } from "./verification.js";

export { renderGitHubAnnotations } from "./report-annotations.js";
export { renderHtml, type HtmlOptions } from "./report-html.js";
export { renderSarif } from "./report-sarif.js";

const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export interface GateOptions {
  failOn: Severity;
  maxRisk: number;
  maxRiskDelta?: number;
}

export function shouldFail(report: PatchReport, options: GateOptions): boolean {
  if (report.summary.failedCommandCount > 0) return true;
  if (report.summary.riskScore > options.maxRisk) return true;
  if (options.maxRiskDelta !== undefined && report.baseline && report.baseline.riskDelta > options.maxRiskDelta) return true;
  const threshold = severityRank[options.failOn];
  return report.findings.some((finding) => severityRank[finding.severity] >= threshold);
}

export function renderMarkdown(report: PatchReport): string {
  const lines: string[] = [];
  const statusIcon = report.summary.status === "pass" ? "PASS" : report.summary.status === "warn" ? "WARN" : "FAIL";
  const verification = verificationSummary(report);
  const executions = verificationExecutions(report);

  lines.push("# PatchDrill Report");
  lines.push("");
  lines.push(`Status: **${statusIcon}**`);
  lines.push(`Risk score: **${report.summary.riskScore}/100**`);
  lines.push(`Confidence score: **${report.summary.confidenceScore}/100**`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Schema version: ${report.schemaVersion}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Changed files: ${report.summary.changedFileCount}`);
  lines.push(`- Additions / deletions: +${report.summary.additions} / -${report.summary.deletions}`);
  lines.push(`- Required verification commands: ${report.summary.requiredCommandCount}`);
  lines.push(`- Failed verification commands: ${report.summary.failedCommandCount}`);
  lines.push(
    `- Verification evidence: ${verification.run} run, ${verification.passed} passed, ${verification.failed} failed, ${verification.timedOut} timed out, ${verification.missingRequired} missing required, ${verification.skippedOptional} optional skipped`
  );
  lines.push(`- Added lines inspected: ${report.addedLines}`);
  lines.push("");

  if (report.policy) {
    lines.push("## Policy");
    lines.push("");
    lines.push(`- Config: ${report.policy.path}`);
    lines.push(`- Ignored path patterns: ${report.policy.ignoredPaths.length}`);
    if (report.policy.failOn) lines.push(`- Fail-on severity: ${report.policy.failOn}`);
    if (report.policy.maxRisk !== undefined) lines.push(`- Max risk: ${report.policy.maxRisk}`);
    lines.push(`- Policy rules: ${report.policy.ruleCount}`);
    lines.push(`- Policy commands: ${report.policy.requiredCommandCount} required, ${report.policy.optionalCommandCount} optional`);
    lines.push("");
  }

  if (report.codeOwners) {
    lines.push("## Code Owners");
    lines.push("");
    lines.push(`- Config: ${report.codeOwners.path}`);
    lines.push(`- Rules: ${report.codeOwners.ruleCount}`);
    lines.push("");
  }

  if (report.baseline) {
    lines.push("## Baseline");
    lines.push("");
    lines.push(`- Baseline report: ${report.baseline.path}`);
    if (report.baseline.previousStatus) lines.push(`- Status: ${report.baseline.previousStatus} -> ${report.baseline.currentStatus}`);
    if (report.baseline.previousRiskScore !== undefined) {
      lines.push(`- Risk: ${report.baseline.previousRiskScore}/100 -> ${report.baseline.currentRiskScore}/100 (${formatDelta(report.baseline.riskDelta)})`);
    }
    lines.push(`- Findings: ${report.baseline.newFindingCount} new, ${report.baseline.resolvedFindingCount} resolved, ${report.baseline.unchangedFindingCount} unchanged`);
    lines.push("");
  }

  if (report.projectSignals.length > 0) {
    lines.push("## Project Signals");
    lines.push("");
    lines.push("| Ecosystem | Framework | Entrypoint | Manifest | Package manager | Task runner |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const signal of report.projectSignals) {
      lines.push(`| ${signal.ecosystem} | ${signal.framework ?? ""} | ${signal.entrypoint ?? ""} | ${signal.manifestPath} | ${signal.packageManager ?? ""} | ${signal.taskRunner ?? ""} |`);
    }
    lines.push("");
  }

  if (report.affectedPackages.length > 0) {
    lines.push("## Affected Workspace Packages");
    lines.push("");
    lines.push("| Package | Path |");
    lines.push("| --- | --- |");
    for (const workspacePackage of report.affectedPackages) {
      lines.push(`| ${escapePipe(workspacePackage.name)} | ${escapePipe(workspacePackage.path)} |`);
    }
    lines.push("");
  }

  if (report.dependencyChanges.length > 0) {
    lines.push("## Dependency Changes");
    lines.push("");
    lines.push("| File | Type | Package | Path | Change | Before | After |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const change of report.dependencyChanges) {
      lines.push(
        `| ${escapePipe(change.file)} | ${change.dependencyType} | ${escapePipe(change.packageName)} | ${escapePipe(change.packagePath ?? "")} | ${
          change.changeType
        } | ${escapePipe(change.before ?? "")} | ${escapePipe(
          change.after ?? ""
        )} |`
      );
    }
    lines.push("");
  }

  if (report.packageScriptChanges.length > 0) {
    lines.push("## Package Script Changes");
    lines.push("");
    lines.push("| File | Script | Change | Before | After |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const change of report.packageScriptChanges) {
      lines.push(
        `| ${escapePipe(change.file)} | ${markdownTableCode(change.scriptName)} | ${change.changeType} | ${markdownTableCode(change.before ?? "")} | ${markdownTableCode(
          change.after ?? ""
        )} |`
      );
    }
    lines.push("");
  }

  lines.push("## Changed Files");
  lines.push("");
  if (report.changedFiles.length === 0) {
    lines.push("No changed files detected.");
  } else {
    lines.push("| File | Status | +/- | Owners |");
    lines.push("| --- | --- | --- | --- |");
    for (const file of report.changedFiles) {
      const rename = file.previousPath ? `${escapePipe(file.previousPath)} -> ${escapePipe(file.path)}` : escapePipe(file.path);
      lines.push(`| ${rename} | ${file.status} | +${file.additions} / -${file.deletions}${file.binary ? " (binary)" : ""} | ${escapePipe(file.owners?.join(", ") ?? "")} |`);
    }
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No risk findings.");
  } else {
    lines.push("| Severity | Rule | Finding | Location | Remediation |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const finding of report.findings) {
      const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "";
      lines.push(
        `| ${finding.severity} | ${escapeText(finding.ruleId ?? "")} | ${escapeText(finding.title)}: ${escapeText(finding.detail)} | ${escapeText(location)} | ${escapeText(
          finding.remediation ?? ""
        )} |`
      );
    }
  }
  lines.push("");

  lines.push("## Verification Plan");
  lines.push("");
  if (executions.length === 0) {
    lines.push("No verification commands were inferred. This is common for docs-only patches or repos without recognized manifests.");
  } else {
    lines.push("| Required | Package | Command | Result | Reason |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const command of executions) {
      lines.push(
        `| ${command.required ? "yes" : "no"} | ${escapeText(command.packageName ?? command.packagePath ?? "")} | ${markdownTableCode(command.command)} | ${escapePipe(
          formatVerificationStatus(command)
        )} | ${escapeText(command.reason)} |`
      );
    }
  }
  lines.push("");

  if (report.commandResults.length > 0) {
    lines.push("## Command Results");
    lines.push("");
    for (const result of report.commandResults) {
      lines.push(`### ${inlineCode(result.command)}`);
      lines.push("");
      lines.push(`- Exit code: ${result.exitCode}`);
      lines.push(`- Duration: ${result.durationMs}ms`);
      if (result.timedOut) lines.push("- Timed out: yes");
      if (result.stdout.trim()) {
        lines.push("");
        lines.push(...fencedCodeBlock(result.stdout.trim()));
      }
      if (result.stderr.trim()) {
        lines.push("");
        lines.push(...fencedCodeBlock(result.stderr.trim()));
      }
      lines.push("");
    }
  }

  lines.push("## Reviewer Notes");
  lines.push("");
  lines.push("- Treat this report as triage evidence, not a replacement for review.");
  lines.push("- High-impact areas still need human sign-off even when automated commands pass.");

  return `${lines.join("\n")}\n`;
}

export function renderSummaryMarkdown(report: PatchReport): string {
  const lines: string[] = [];
  const statusIcon = report.summary.status === "pass" ? "PASS" : report.summary.status === "warn" ? "WARN" : "FAIL";
  const requiredCommands = report.commandPlan.filter((command) => command.required);
  const optionalCommands = report.commandPlan.filter((command) => !command.required);
  const verification = verificationSummary(report);
  const executions = verificationExecutions(report);

  lines.push("# PatchDrill Summary");
  lines.push("");
  lines.push(`**${statusIcon}** - risk ${report.summary.riskScore}/100, confidence ${report.summary.confidenceScore}/100`);
  lines.push("");
  lines.push(`- Changed files: ${report.summary.changedFileCount} (+${report.summary.additions} / -${report.summary.deletions})`);
  lines.push(`- Verification plan: ${requiredCommands.length} required, ${optionalCommands.length} optional`);
  lines.push(
    `- Verification evidence: ${verification.run} run, ${verification.passed} passed, ${verification.failed} failed, ${verification.timedOut} timed out, ${verification.missingRequired} missing required, ${verification.skippedOptional} optional skipped`
  );
  if (report.baseline) {
    lines.push(`- Baseline risk delta: ${formatDelta(report.baseline.riskDelta)} (${report.baseline.newFindingCount} new findings)`);
  }
  lines.push("");

  lines.push("## Changed Files");
  lines.push("");
  if (report.changedFiles.length === 0) {
    lines.push("No changed files detected.");
  } else {
    for (const file of report.changedFiles.slice(0, 5)) {
      const path = file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path;
      lines.push(`- \`${escapeBackticks(path)}\` (${file.status}, +${file.additions} / -${file.deletions}${file.binary ? ", binary" : ""})`);
    }
    if (report.changedFiles.length > 5) {
      lines.push("");
      lines.push(`_${report.changedFiles.length - 5} more changed files in the full report._`);
    }
  }
  lines.push("");

  lines.push("## Top Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No risk findings.");
  } else {
    lines.push("| Severity | Finding | Location |");
    lines.push("| --- | --- | --- |");
    for (const finding of report.findings.slice(0, 5)) {
      lines.push(`| ${finding.severity} | ${escapeText(finding.title)} | ${escapeText(findingLocation(finding))} |`);
    }
    if (report.findings.length > 5) {
      lines.push("");
      lines.push(`_${report.findings.length - 5} more findings in the full report._`);
    }
  }
  lines.push("");

  lines.push("## Required Checks");
  lines.push("");
  if (requiredCommands.length === 0) {
    lines.push("No required verification commands were inferred.");
  } else {
    lines.push("| Command | Result |");
    lines.push("| --- | --- |");
    for (const command of executions.filter((execution) => execution.required).slice(0, 5)) {
      lines.push(`| ${markdownTableCode(command.command)} | ${escapePipe(formatVerificationStatus(command))} |`);
    }
    if (requiredCommands.length > 5) {
      lines.push("");
      lines.push(`_${requiredCommands.length - 5} more required checks in the full report._`);
    }
  }
  lines.push("");

  lines.push("Full Markdown, JSON, SARIF, and HTML reports remain available as CI artifacts when configured.");

  return `${lines.join("\n")}\n`;
}

function findingLocation(finding: { file?: string; line?: number }): string {
  return finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "Global";
}

function escapePipe(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

// Untrusted free text rendered as plain Markdown can carry inline HTML that
// renderers like GitHub permit (e.g. <img src=x>, <a href> spoofs). Neutralizing
// "<" breaks every tag while keeping the text legible.
function escapeText(value: string): string {
  return escapePipe(value).replaceAll("<", "&lt;");
}

function escapeBackticks(value: string): string {
  return value.replaceAll("`", "\\`");
}

function markdownTableCode(value: string): string {
  return `\`${escapePipe(escapeBackticks(value))}\``;
}

function longestBacktickRun(value: string): number {
  let longest = 0;
  let current = 0;
  for (const char of value) {
    if (char === "`") {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

// Untrusted command output may itself contain ``` fences; size the fence to one
// backtick longer than the longest run so the content cannot break out.
function fencedCodeBlock(content: string): string[] {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
  return [`${fence}text`, content, fence];
}

function inlineCode(value: string): string {
  const ticks = "`".repeat(longestBacktickRun(value) + 1);
  const single = value.replaceAll("\n", " ");
  const padded = single.startsWith("`") || single.endsWith("`") ? ` ${single} ` : single;
  return `${ticks}${padded}${ticks}`;
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
