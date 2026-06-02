import type { CommandPlan } from "./types.js";

export function addCommandPlan(plans: CommandPlan[], candidate: CommandPlan): void {
  const existingIndex = plans.findIndex((existing) => sameCommandPlan(existing, candidate));
  if (existingIndex === -1) {
    plans.push(candidate);
    return;
  }
  plans[existingIndex] = mergeCommandPlan(plans[existingIndex]!, candidate);
}

export function mergeCommandPlanLists(...lists: CommandPlan[][]): CommandPlan[] {
  const merged: CommandPlan[] = [];
  for (const list of lists) {
    for (const plan of list) {
      addCommandPlan(merged, plan);
    }
  }
  return merged;
}

function sameCommandPlan(left: CommandPlan, right: CommandPlan): boolean {
  return left.id === right.id || left.command === right.command;
}

function mergeCommandPlan(existing: CommandPlan, candidate: CommandPlan): CommandPlan {
  if (existing.required === candidate.required) return existing;
  return existing.required ? { ...existing, required: true } : { ...candidate, required: true };
}
