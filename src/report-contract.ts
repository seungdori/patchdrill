import type { PatchReport } from "./types.js";

export function reportContractFailures(report: Partial<PatchReport>): string[] {
  const failures: string[] = [];
  if (!isRecord(report.summary)) {
    failures.push("JSON report summary is invalid.");
    return failures;
  }

  if (!Array.isArray(report.changedFiles)) {
    failures.push("JSON report changedFiles is invalid.");
  } else {
    const additions = report.changedFiles.reduce((sum, file) => sum + numericField(file, "additions"), 0);
    const deletions = report.changedFiles.reduce((sum, file) => sum + numericField(file, "deletions"), 0);
    if (report.summary.changedFileCount !== report.changedFiles.length) {
      failures.push("JSON report summary.changedFileCount does not match changedFiles.");
    }
    if (report.summary.additions !== additions) {
      failures.push("JSON report summary.additions does not match changedFiles.");
    }
    if (report.summary.deletions !== deletions) {
      failures.push("JSON report summary.deletions does not match changedFiles.");
    }
  }

  if (Array.isArray(report.commandPlan) && report.summary.requiredCommandCount !== report.commandPlan.filter((command) => command.required === true).length) {
    failures.push("JSON report summary.requiredCommandCount does not match commandPlan.");
  }

  if (Array.isArray(report.commandResults) && report.summary.failedCommandCount !== report.commandResults.filter((result) => result.exitCode !== 0).length) {
    failures.push("JSON report summary.failedCommandCount does not match commandResults.");
  }

  return failures;
}

function numericField(value: unknown, field: string): number {
  return isRecord(value) && typeof value[field] === "number" ? value[field] : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
