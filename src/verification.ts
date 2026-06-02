import type { CommandPlan, CommandResult, PatchReport, PatchVerification, VerificationCommand, VerificationStatus, VerificationSummary } from "./types.js";

export interface VerificationExecution extends VerificationCommand {
  result?: CommandResult;
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
      ...(result ? { exitCode: result.exitCode, durationMs: result.durationMs } : {}),
      ...(result?.timedOut !== undefined ? { timedOut: result.timedOut } : {}),
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
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      ...(result.timedOut !== undefined ? { timedOut: result.timedOut } : {}),
      status: statusFor(undefined, result)
    });
  }

  return executions;
}

export function verificationSummary(report: Pick<PatchReport, "commandPlan" | "commandResults">): VerificationSummary {
  const executions = verificationExecutions(report);
  return summarizeExecutions(report.commandPlan, executions);
}

function summarizeExecutions(commandPlan: CommandPlan[], executions: VerificationExecution[]): VerificationSummary {
  return {
    plannedRequired: commandPlan.filter((command) => command.required).length,
    plannedOptional: commandPlan.filter((command) => !command.required).length,
    run: executions.filter((execution) => execution.result).length,
    passed: executions.filter((execution) => execution.result && execution.status === "passed").length,
    // Status-based so passed + failed + timedOut partitions `run`: a timed-out
    // command has exitCode 124 and must not also be counted as failed.
    failed: executions.filter((execution) => execution.result && execution.status === "failed").length,
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

export function reportVerification(report: Pick<PatchReport, "commandPlan" | "commandResults">): PatchVerification {
  const executions = verificationExecutions(report);
  return {
    summary: summarizeExecutions(report.commandPlan, executions),
    commands: executions.map(toVerificationCommand)
  };
}

export function withVerification<T extends Omit<PatchReport, "verification">>(report: T): T & { verification: PatchVerification } {
  return {
    ...report,
    verification: reportVerification(report)
  };
}

function toVerificationCommand(execution: VerificationExecution): VerificationCommand {
  return {
    id: execution.id,
    label: execution.label,
    command: execution.command,
    reason: execution.reason,
    ecosystem: execution.ecosystem,
    required: execution.required,
    planned: execution.planned,
    status: execution.status,
    ...(execution.packageName ? { packageName: execution.packageName } : {}),
    ...(execution.packagePath ? { packagePath: execution.packagePath } : {}),
    ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    ...(execution.durationMs !== undefined ? { durationMs: execution.durationMs } : {}),
    ...(execution.timedOut !== undefined ? { timedOut: execution.timedOut } : {})
  };
}

function statusFor(plan: CommandPlan | undefined, result: CommandResult | undefined): VerificationStatus {
  if (!result) return plan?.required ? "not-run" : "skipped-optional";
  if (result.timedOut) return "timed-out";
  return result.exitCode === 0 ? "passed" : "failed";
}
