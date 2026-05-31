import type { PatchReport, Severity } from "./types.js";

const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export function shouldFail(report: PatchReport, failOn: Severity): boolean {
  if (report.summary.status === "fail") return true;
  const threshold = severityRank[failOn];
  return report.findings.some((finding) => severityRank[finding.severity] >= threshold);
}

export function renderMarkdown(report: PatchReport): string {
  const lines: string[] = [];
  const statusIcon = report.summary.status === "pass" ? "PASS" : report.summary.status === "warn" ? "WARN" : "FAIL";

  lines.push("# PatchDrill Report");
  lines.push("");
  lines.push(`Status: **${statusIcon}**`);
  lines.push(`Risk score: **${report.summary.riskScore}/100**`);
  lines.push(`Confidence score: **${report.summary.confidenceScore}/100**`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Changed files: ${report.summary.changedFileCount}`);
  lines.push(`- Additions / deletions: +${report.summary.additions} / -${report.summary.deletions}`);
  lines.push(`- Required verification commands: ${report.summary.requiredCommandCount}`);
  lines.push(`- Failed verification commands: ${report.summary.failedCommandCount}`);
  lines.push("");

  if (report.projectSignals.length > 0) {
    lines.push("## Project Signals");
    lines.push("");
    lines.push("| Ecosystem | Manifest | Package manager |");
    lines.push("| --- | --- | --- |");
    for (const signal of report.projectSignals) {
      lines.push(`| ${signal.ecosystem} | ${signal.manifestPath} | ${signal.packageManager ?? ""} |`);
    }
    lines.push("");
  }

  lines.push("## Changed Files");
  lines.push("");
  if (report.changedFiles.length === 0) {
    lines.push("No changed files detected.");
  } else {
    lines.push("| File | Status | +/- |");
    lines.push("| --- | --- | --- |");
    for (const file of report.changedFiles) {
      const rename = file.previousPath ? `${escapePipe(file.previousPath)} -> ${escapePipe(file.path)}` : escapePipe(file.path);
      lines.push(`| ${rename} | ${file.status} | +${file.additions} / -${file.deletions}${file.binary ? " (binary)" : ""} |`);
    }
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No risk findings.");
  } else {
    lines.push("| Severity | Finding | File | Remediation |");
    lines.push("| --- | --- | --- | --- |");
    for (const finding of report.findings) {
      lines.push(
        `| ${finding.severity} | ${escapePipe(finding.title)}: ${escapePipe(finding.detail)} | ${escapePipe(finding.file ?? "")} | ${escapePipe(
          finding.remediation ?? ""
        )} |`
      );
    }
  }
  lines.push("");

  lines.push("## Verification Plan");
  lines.push("");
  if (report.commandPlan.length === 0) {
    lines.push("No verification commands were inferred. This is common for docs-only patches or repos without recognized manifests.");
  } else {
    lines.push("| Required | Command | Reason |");
    lines.push("| --- | --- | --- |");
    for (const command of report.commandPlan) {
      lines.push(`| ${command.required ? "yes" : "no"} | \`${escapeBackticks(command.command)}\` | ${escapePipe(command.reason)} |`);
    }
  }
  lines.push("");

  if (report.commandResults.length > 0) {
    lines.push("## Command Results");
    lines.push("");
    for (const result of report.commandResults) {
      lines.push(`### ${result.command}`);
      lines.push("");
      lines.push(`- Exit code: ${result.exitCode}`);
      lines.push(`- Duration: ${result.durationMs}ms`);
      if (result.stdout.trim()) {
        lines.push("");
        lines.push("```text");
        lines.push(result.stdout.trim());
        lines.push("```");
      }
      if (result.stderr.trim()) {
        lines.push("");
        lines.push("```text");
        lines.push(result.stderr.trim());
        lines.push("```");
      }
      lines.push("");
    }
  }

  lines.push("## Reviewer Notes");
  lines.push("");
  lines.push("- Treat this report as triage evidence, not a replacement for review.");
  lines.push("- High-impact areas still need human sign-off even when automated commands pass.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function escapePipe(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeBackticks(value: string): string {
  return value.replaceAll("`", "\\`");
}
