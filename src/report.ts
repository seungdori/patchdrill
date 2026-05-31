import { createHash } from "node:crypto";
import type { PatchReport, Severity } from "./types.js";

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
}

export function shouldFail(report: PatchReport, options: GateOptions): boolean {
  if (report.summary.failedCommandCount > 0) return true;
  if (report.summary.riskScore > options.maxRisk) return true;
  const threshold = severityRank[options.failOn];
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
    lines.push("| Ecosystem | Manifest | Package manager |");
    lines.push("| --- | --- | --- |");
    for (const signal of report.projectSignals) {
      lines.push(`| ${signal.ecosystem} | ${signal.manifestPath} | ${signal.packageManager ?? ""} |`);
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
        `| ${finding.severity} | ${escapePipe(finding.ruleId ?? "")} | ${escapePipe(finding.title)}: ${escapePipe(finding.detail)} | ${escapePipe(location)} | ${escapePipe(
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
    lines.push("| Required | Package | Command | Reason |");
    lines.push("| --- | --- | --- | --- |");
    for (const command of report.commandPlan) {
      lines.push(
        `| ${command.required ? "yes" : "no"} | ${escapePipe(command.packageName ?? "")} | \`${escapeBackticks(command.command)}\` | ${escapePipe(command.reason)} |`
      );
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

export function renderSarif(report: PatchReport): string {
  const rules = new Map<string, { id: string; name: string; shortDescription: { text: string }; help?: { text: string }; properties: Record<string, unknown> }>();
  const results = report.findings
    .filter((finding) => finding.file)
    .map((finding) => {
      const ruleId = finding.ruleId ?? slug(finding.title);
      rules.set(ruleId, {
        id: ruleId,
        name: finding.title,
        shortDescription: { text: finding.title },
        ...(finding.remediation ? { help: { text: finding.remediation } } : {}),
        properties: {
          severity: finding.severity,
          tags: finding.tags ?? []
        }
      });
      return {
        ruleId,
        level: sarifLevel(finding.severity),
        message: {
          text: `${finding.title}: ${finding.detail}${finding.remediation ? ` Remediation: ${finding.remediation}` : ""}`
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: finding.file
              },
              region: {
                startLine: finding.line ?? 1
              }
            }
          }
        ],
        properties: {
          severity: finding.severity,
          tags: finding.tags ?? []
        },
        partialFingerprints: {
          patchdrillFinding: stableFingerprint(ruleId, finding.file ?? "", finding.line ?? 0, finding.title)
        }
      };
    });

  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "PatchDrill",
              informationUri: "https://github.com/patchdrill/patchdrill",
              rules: [...rules.values()]
            }
          },
          invocations: [
            {
              executionSuccessful: report.summary.failedCommandCount === 0,
              properties: {
                status: report.summary.status,
                riskScore: report.summary.riskScore,
                confidenceScore: report.summary.confidenceScore
              }
            }
          ],
          results
        }
      ]
    },
    null,
    2
  )}\n`;
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" | "none" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  if (severity === "low" || severity === "info") return "note";
  return "none";
}

function escapePipe(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeBackticks(value: string): string {
  return value.replaceAll("`", "\\`");
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "patchdrill-finding";
}

function stableFingerprint(ruleId: string, file: string, line: number, title: string): string {
  return createHash("sha256").update(`${ruleId}\0${file}\0${line}\0${title}`).digest("hex");
}
