import type { PatchReport } from "./types.js";
import { reportVerification } from "./verification.js";

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

  // findings is the explanation of the risk score and is required by the schema;
  // a report missing it must not pass verify/dashboard/evidence.
  if (!Array.isArray(report.findings)) {
    failures.push("JSON report findings is invalid.");
  }

  if (report.verification === undefined) {
    failures.push("JSON report verification is missing.");
  } else if (!isRecord(report.verification)) {
    failures.push("JSON report verification is invalid.");
  } else if (Array.isArray(report.commandPlan) && Array.isArray(report.commandResults)) {
    const expected = reportVerification({
      commandPlan: report.commandPlan,
      commandResults: report.commandResults
    });
    if (!structurallyEqual(report.verification, expected)) {
      failures.push("JSON report verification does not match commandPlan and commandResults.");
    }
  }

  return failures;
}

function numericField(value: unknown, field: string): number {
  return isRecord(value) && typeof value[field] === "number" ? value[field] : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => structurallyEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    const rightKey = rightKeys[index];
    if (key === undefined || rightKey === undefined || key !== rightKey) return false;
    if (!structurallyEqual(left[key], right[key])) return false;
  }
  return true;
}
