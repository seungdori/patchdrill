import type { CommandPlan, CommandResult, PatchReport } from "./types.js";

export type VerificationStatus = "passed" | "failed" | "timed-out" | "not-run" | "skipped-optional";

export interface VerificationExecution {
  id: string;
  label: string;
  command: string;
  reason: string;
  ecosystem: CommandPlan["ecosystem"];
  required: boolean;
  planned: boolean;
  packageName?: string;
  packagePath?: string;
  result?: CommandResult;
  status: VerificationStatus;
}

export interface VerificationSummary {
  plannedRequired: number;
  plannedOptional: number;
  run: number;
  passed: number;
  failed: number;
  timedOut: number;
  missingRequired: number;
  skippedOptional: number;
  unplannedResults: number;
}

export function verificationExecutions(report: Pick<PatchReport, "commandPlan" | "commandResults">): VerificationExecution[] {
  const resultsById = new Map(report.commandResults.map((result) => [result.id, result]));
  const plannedIds = new Set(report.commandPlan.map((plan) => plan.id));
  const executions: VerificationExecution[] = report.commandPlan.map((plan) => {
    const result = resultsById.get(plan.id);
    return {
      id: plan.id,
      label: plan.label,
      command: plan.command,
      reason: plan.reason,
      ecosystem: plan.ecosystem,
      required: plan.required,
      planned: true,
      ...(plan.packageName ? { packageName: plan.packageName } : {}),
      ...(plan.packagePath ? { packagePath: plan.packagePath } : {}),
      ...(result ? { result } : {}),
      status: statusFor(plan, result)
    };
  });

  for (const result of report.commandResults) {
    if (plannedIds.has(result.id)) continue;
    executions.push({
      id: result.id,
      label: "Unplanned command result",
      command: result.command,
      reason: "A command result was recorded without a matching verification plan entry.",
      ecosystem: "general",
      required: false,
      planned: false,
      result,
      status: statusFor(undefined, result)
    });
  }

  return executions;
}

export function verificationSummary(report: Pick<PatchReport, "commandPlan" | "commandResults">): VerificationSummary {
  const executions = verificationExecutions(report);
  return {
    plannedRequired: report.commandPlan.filter((command) => command.required).length,
    plannedOptional: report.commandPlan.filter((command) => !command.required).length,
    run: executions.filter((execution) => execution.result).length,
    passed: executions.filter((execution) => execution.result && execution.status === "passed").length,
    failed: executions.filter((execution) => execution.result && execution.result.exitCode !== 0).length,
    timedOut: executions.filter((execution) => execution.result?.timedOut === true).length,
    missingRequired: executions.filter((execution) => execution.status === "not-run").length,
    skippedOptional: executions.filter((execution) => execution.status === "skipped-optional").length,
    unplannedResults: executions.filter((execution) => !execution.planned).length
  };
}

export function formatVerificationStatus(execution: VerificationExecution): string {
  const prefix = execution.planned ? "" : "unplanned ";
  if (!execution.result) return execution.status === "skipped-optional" ? "skipped optional" : "not run";
  if (execution.result.timedOut) return `${prefix}timed out (${execution.result.exitCode})`;
  if (execution.result.exitCode === 0) return `${prefix}passed`;
  return `${prefix}failed (${execution.result.exitCode})`;
}

function statusFor(plan: CommandPlan | undefined, result: CommandResult | undefined): VerificationStatus {
  if (!result) return plan?.required ? "not-run" : "skipped-optional";
  if (result.timedOut) return "timed-out";
  return result.exitCode === 0 ? "passed" : "failed";
}
