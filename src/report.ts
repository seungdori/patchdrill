import { t, type Locale } from "./i18n.js";
import type { PatchReport, Severity, VerificationSummary } from "./types.js";
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

export function renderMarkdown(report: PatchReport, locale: Locale = "en"): string {
  const tr = (text: string): string => t(locale, text);
  const lines: string[] = [];
  const statusIcon = tr(report.summary.status === "pass" ? "PASS" : report.summary.status === "warn" ? "WARN" : "FAIL");
  const verification = verificationSummary(report);
  const executions = verificationExecutions(report);

  lines.push(`# ${tr("PatchDrill Report")}`);
  lines.push("");
  lines.push(`${tr("Status")}: **${statusIcon}**`);
  lines.push(`${tr("Risk score")}: **${report.summary.riskScore}/100**`);
  lines.push(`${tr("Confidence score")}: **${report.summary.confidenceScore}/100**`);
  lines.push(`${tr("Generated")}: ${report.generatedAt}`);
  lines.push(`${tr("Schema version")}: ${report.schemaVersion}`);
  lines.push("");
  lines.push(`## ${tr("Summary")}`);
  lines.push("");
  lines.push(`- ${tr("Changed files")}: ${report.summary.changedFileCount}`);
  lines.push(`- ${tr("Additions / deletions")}: +${report.summary.additions} / -${report.summary.deletions}`);
  lines.push(`- ${tr("Required verification commands")}: ${report.summary.requiredCommandCount}`);
  lines.push(`- ${tr("Failed verification commands")}: ${report.summary.failedCommandCount}`);
  lines.push(`- ${tr("Verification evidence")}: ${verificationEvidencePhrase(verification, locale)}`);
  lines.push(`- ${tr("Added lines inspected")}: ${report.addedLines}`);
  lines.push("");

  if (report.policy) {
    lines.push(`## ${tr("Policy")}`);
    lines.push("");
    lines.push(`- ${tr("Config")}: ${report.policy.path}`);
    lines.push(`- ${tr("Ignored path patterns")}: ${report.policy.ignoredPaths.length}`);
    if (report.policy.failOn) lines.push(`- ${tr("Fail-on severity")}: ${report.policy.failOn}`);
    if (report.policy.maxRisk !== undefined) lines.push(`- ${tr("Max risk")}: ${report.policy.maxRisk}`);
    lines.push(`- ${tr("Policy rules")}: ${report.policy.ruleCount}`);
    lines.push(`- ${tr("Policy commands")}: ${report.policy.requiredCommandCount} ${tr("required")}, ${report.policy.optionalCommandCount} ${tr("optional")}`);
    lines.push("");
  }

  if (report.codeOwners) {
    lines.push(`## ${tr("Code Owners")}`);
    lines.push("");
    lines.push(`- ${tr("Config")}: ${report.codeOwners.path}`);
    lines.push(`- ${tr("Rules")}: ${report.codeOwners.ruleCount}`);
    lines.push("");
  }

  if (report.baseline) {
    lines.push(`## ${tr("Baseline")}`);
    lines.push("");
    lines.push(`- ${tr("Baseline report")}: ${report.baseline.path}`);
    if (report.baseline.previousStatus) lines.push(`- ${tr("Status")}: ${tr(report.baseline.previousStatus)} -> ${tr(report.baseline.currentStatus)}`);
    if (report.baseline.previousRiskScore !== undefined) {
      lines.push(`- ${tr("Risk")}: ${report.baseline.previousRiskScore}/100 -> ${report.baseline.currentRiskScore}/100 (${formatDelta(report.baseline.riskDelta)})`);
    }
    lines.push(`- ${tr("Findings")}: ${report.baseline.newFindingCount} ${tr("new")}, ${report.baseline.resolvedFindingCount} ${tr("resolved")}, ${report.baseline.unchangedFindingCount} ${tr("unchanged")}`);
    lines.push("");
  }

  if (report.projectSignals.length > 0) {
    lines.push(`## ${tr("Project Signals")}`);
    lines.push("");
    lines.push(`| ${tr("Ecosystem")} | ${tr("Framework")} | ${tr("Entrypoint")} | ${tr("Manifest")} | ${tr("Package manager")} | ${tr("Task runner")} |`);
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const signal of report.projectSignals) {
      lines.push(`| ${signal.ecosystem} | ${signal.framework ?? ""} | ${signal.entrypoint ?? ""} | ${signal.manifestPath} | ${signal.packageManager ?? ""} | ${signal.taskRunner ?? ""} |`);
    }
    lines.push("");
  }

  if (report.affectedPackages.length > 0) {
    lines.push(`## ${tr("Affected Workspace Packages")}`);
    lines.push("");
    lines.push(`| ${tr("Package")} | ${tr("Path")} |`);
    lines.push("| --- | --- |");
    for (const workspacePackage of report.affectedPackages) {
      lines.push(`| ${escapePipe(workspacePackage.name)} | ${escapePipe(workspacePackage.path)} |`);
    }
    lines.push("");
  }

  if (report.dependencyChanges.length > 0) {
    lines.push(`## ${tr("Dependency Changes")}`);
    lines.push("");
    lines.push(`| ${tr("File")} | ${tr("Type")} | ${tr("Package")} | ${tr("Path")} | ${tr("Change")} | ${tr("Before")} | ${tr("After")} |`);
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
    lines.push(`## ${tr("Package Script Changes")}`);
    lines.push("");
    lines.push(`| ${tr("File")} | ${tr("Script")} | ${tr("Change")} | ${tr("Before")} | ${tr("After")} |`);
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

  lines.push(`## ${tr("Changed Files")}`);
  lines.push("");
  if (report.changedFiles.length === 0) {
    lines.push(tr("No changed files detected."));
  } else {
    lines.push(`| ${tr("File")} | ${tr("Status")} | ${tr("+/-")} | ${tr("Owners")} |`);
    lines.push("| --- | --- | --- | --- |");
    for (const file of report.changedFiles) {
      const rename = file.previousPath ? `${escapePipe(file.previousPath)} -> ${escapePipe(file.path)}` : escapePipe(file.path);
      lines.push(`| ${rename} | ${file.status} | +${file.additions} / -${file.deletions}${file.binary ? " (binary)" : ""} | ${escapePipe(file.owners?.join(", ") ?? "")} |`);
    }
  }
  lines.push("");

  lines.push(`## ${tr("Findings")}`);
  lines.push("");
  if (report.findings.length === 0) {
    lines.push(tr("No risk findings."));
  } else {
    lines.push(`| ${tr("Severity")} | ${tr("Rule")} | ${tr("Finding")} | ${tr("Location")} | ${tr("Remediation")} |`);
    lines.push("| --- | --- | --- | --- | --- |");
    for (const finding of report.findings) {
      const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "";
      lines.push(
        `| ${tr(finding.severity)} | ${escapeText(finding.ruleId ?? "")} | ${escapeText(tr(finding.title))}: ${escapeText(tr(finding.detail))} | ${escapeText(location)} | ${escapeText(
          tr(finding.remediation ?? "")
        )} |`
      );
    }
  }
  lines.push("");

  lines.push(`## ${tr("Verification Plan")}`);
  lines.push("");
  if (executions.length === 0) {
    lines.push(tr("No verification commands were inferred. This is common for docs-only patches or repos without recognized manifests."));
  } else {
    lines.push(`| ${tr("Required")} | ${tr("Package")} | ${tr("Command")} | ${tr("Result")} | ${tr("Reason")} |`);
    lines.push("| --- | --- | --- | --- | --- |");
    for (const command of executions) {
      lines.push(
        `| ${command.required ? tr("yes") : tr("no")} | ${escapeText(command.packageName ?? command.packagePath ?? "")} | ${markdownTableCode(command.command)} | ${escapePipe(
          tr(formatVerificationStatus(command))
        )} | ${escapeText(tr(command.reason))} |`
      );
    }
  }
  lines.push("");

  if (report.commandResults.length > 0) {
    lines.push(`## ${tr("Command Results")}`);
    lines.push("");
    for (const result of report.commandResults) {
      lines.push(`### ${inlineCode(result.command)}`);
      lines.push("");
      lines.push(`- ${tr("Exit code")}: ${result.exitCode}`);
      lines.push(`- ${tr("Duration")}: ${result.durationMs}ms`);
      if (result.timedOut) lines.push(`- ${tr("Timed out: yes")}`);
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

  lines.push(`## ${tr("Reviewer Notes")}`);
  lines.push("");
  lines.push(`- ${tr("Treat this report as triage evidence, not a replacement for review.")}`);
  lines.push(`- ${tr("High-impact areas still need human sign-off even when automated commands pass.")}`);

  return `${lines.join("\n")}\n`;
}

export function renderSummaryMarkdown(report: PatchReport, locale: Locale = "en"): string {
  const tr = (text: string): string => t(locale, text);
  const lines: string[] = [];
  const statusIcon = tr(report.summary.status === "pass" ? "PASS" : report.summary.status === "warn" ? "WARN" : "FAIL");
  const requiredCommands = report.commandPlan.filter((command) => command.required);
  const optionalCommands = report.commandPlan.filter((command) => !command.required);
  const verification = verificationSummary(report);
  const executions = verificationExecutions(report);

  lines.push(`# ${tr("PatchDrill Summary")}`);
  lines.push("");
  lines.push(`**${statusIcon}** - ${tr("risk")} ${report.summary.riskScore}/100, ${tr("confidence")} ${report.summary.confidenceScore}/100`);
  lines.push("");
  lines.push(`- ${tr("Changed files")}: ${report.summary.changedFileCount} (+${report.summary.additions} / -${report.summary.deletions})`);
  lines.push(`- ${tr("Verification plan")}: ${requiredCommands.length} ${tr("required")}, ${optionalCommands.length} ${tr("optional")}`);
  lines.push(`- ${tr("Verification evidence")}: ${verificationEvidencePhrase(verification, locale)}`);
  if (report.baseline) {
    lines.push(`- ${tr("Baseline risk delta")}: ${formatDelta(report.baseline.riskDelta)} (${report.baseline.newFindingCount} ${tr("new findings")})`);
  }
  lines.push("");

  lines.push(`## ${tr("Changed Files")}`);
  lines.push("");
  if (report.changedFiles.length === 0) {
    lines.push(tr("No changed files detected."));
  } else {
    for (const file of report.changedFiles.slice(0, 5)) {
      const path = file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path;
      lines.push(`- \`${escapeBackticks(path)}\` (${tr(file.status)}, +${file.additions} / -${file.deletions}${file.binary ? `, ${tr("binary")}` : ""})`);
    }
    if (report.changedFiles.length > 5) {
      lines.push("");
      lines.push(`_${report.changedFiles.length - 5} ${tr("more changed files in the full report.")}_`);
    }
  }
  lines.push("");

  lines.push(`## ${tr("Top Findings")}`);
  lines.push("");
  if (report.findings.length === 0) {
    lines.push(tr("No risk findings."));
  } else {
    lines.push(`| ${tr("Severity")} | ${tr("Finding")} | ${tr("Location")} |`);
    lines.push("| --- | --- | --- |");
    for (const finding of report.findings.slice(0, 5)) {
      lines.push(`| ${tr(finding.severity)} | ${escapeText(tr(finding.title))} | ${escapeText(tr(findingLocation(finding)))} |`);
    }
    if (report.findings.length > 5) {
      lines.push("");
      lines.push(`_${report.findings.length - 5} ${tr("more findings in the full report.")}_`);
    }
  }
  lines.push("");

  lines.push(`## ${tr("Required Checks")}`);
  lines.push("");
  if (requiredCommands.length === 0) {
    lines.push(tr("No required verification commands were inferred."));
  } else {
    lines.push(`| ${tr("Command")} | ${tr("Result")} |`);
    lines.push("| --- | --- |");
    for (const command of executions.filter((execution) => execution.required).slice(0, 5)) {
      lines.push(`| ${markdownTableCode(command.command)} | ${escapePipe(tr(formatVerificationStatus(command)))} |`);
    }
    if (requiredCommands.length > 5) {
      lines.push("");
      lines.push(`_${requiredCommands.length - 5} ${tr("more required checks in the full report.")}_`);
    }
  }
  lines.push("");

  lines.push(tr("Full Markdown, JSON, SARIF, and HTML reports remain available as CI artifacts when configured."));

  return `${lines.join("\n")}\n`;
}

function findingLocation(finding: { file?: string; line?: number }): string {
  return finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "Global";
}

export function verificationEvidencePhrase(verification: VerificationSummary, locale: Locale): string {
  const tr = (text: string): string => t(locale, text);
  return `${verification.run} ${tr("run")}, ${verification.passed} ${tr("passed")}, ${verification.failed} ${tr("failed")}, ${verification.timedOut} ${tr("timed out")}, ${verification.missingRequired} ${tr("missing required")}, ${verification.skippedOptional} ${tr("optional skipped")}`;
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
