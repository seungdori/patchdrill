import { describe, expect, it } from "vitest";
import { addCommandPlan, mergeCommandPlanLists } from "../src/command-plan.js";
import type { CommandPlan } from "../src/types.js";

describe("command plan normalization", () => {
  it("deduplicates matching commands and promotes required candidates", () => {
    const optional = commandPlan({ id: "node-lint", command: "npm run lint", required: false });
    const required = commandPlan({
      id: "policy-required-lint",
      label: "Policy lint",
      command: "npm run lint",
      reason: "Team policy requires lint before merge.",
      ecosystem: "general",
      required: true
    });

    expect(mergeCommandPlanLists([optional], [required])).toEqual([required]);
  });

  it("does not weaken an existing required plan when an optional duplicate appears later", () => {
    const required = commandPlan({ id: "node-test", command: "npm test", required: true });
    const optional = commandPlan({ id: "policy-optional-test", command: "npm test", required: false });

    expect(mergeCommandPlanLists([required], [optional])).toEqual([required]);
  });

  it("appends distinct command plans in insertion order", () => {
    const plans: CommandPlan[] = [];
    const test = commandPlan({ id: "node-test", command: "npm test", required: true });
    const build = commandPlan({ id: "node-build", command: "npm run build", required: true });

    addCommandPlan(plans, test);
    addCommandPlan(plans, build);

    expect(plans).toEqual([test, build]);
  });
});

function commandPlan(overrides: Pick<CommandPlan, "id" | "command" | "required"> & Partial<CommandPlan>): CommandPlan {
  return {
    label: overrides.id,
    reason: "Test command plan.",
    ecosystem: "node",
    ...overrides
  };
}
