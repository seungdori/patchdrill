import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { filterIgnoredFiles, loadPolicy, matchesAnyPath, mergePolicyCommands } from "../src/policy.js";
import type { ChangedFile, CommandPlan, PatchPolicy } from "../src/types.js";

const tempDirs: string[] = [];

describe("policy", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads YAML policy and merges configured commands", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-policy-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, ".patchdrill.yml"),
      `
failOn: high
maxRisk: 80
ignoredPaths:
  - generated/**
requiredCommands:
  - id: contract-tests
    command: npm run test:contracts
    reason: API contract changed.
rules:
  - id: database-review
    title: Database schema review required
    severity: high
    path: src/schema/**
`
    );

    const loaded = loadPolicy(root);
    const files: ChangedFile[] = [
      { path: "generated/client.ts", status: "modified", additions: 1, deletions: 0, binary: false },
      { path: "src/schema/user.ts", status: "modified", additions: 1, deletions: 0, binary: false }
    ];

    expect(loaded.policy.failOn).toBe("high");
    expect(loaded.policy.maxRisk).toBe(80);
    expect(filterIgnoredFiles(files, loaded.policy).map((file) => file.path)).toEqual(["src/schema/user.ts"]);
    expect(mergePolicyCommands([], loaded.policy)).toContainEqual(
      expect.objectContaining({
        id: "contract-tests",
        required: true
      })
    );
  });

  it("matches glob patterns", () => {
    expect(matchesAnyPath("src/auth/session.ts", ["src/**/session.ts"])).toBe(true);
    expect(matchesAnyPath("src/session.ts", ["src/**/session.ts"])).toBe(true);
    expect(matchesAnyPath("snapshot.snap", ["**/*.snap"])).toBe(true);
    expect(matchesAnyPath("src/auth/session.ts", ["docs/**"])).toBe(false);
  });

  it("fails fast on invalid policy fields", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-policy-invalid-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, ".patchdrill.yml"),
      `
failOn: severe
requiredCommands:
  - id: missing-command
rules:
  - id: missing-title
    severity: high
`
    );

    expect(() => loadPolicy(root)).toThrow(/failOn/);
  });

  it("fails fast on malformed policy rules", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-policy-invalid-rule-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, ".patchdrill.yml"),
      `
rules:
  - id: missing-title
    severity: high
`
    );

    expect(() => loadPolicy(root)).toThrow(/rules\[0\]\.title/);
  });

  it("promotes inferred optional commands when policy requires the same command", () => {
    const existing: CommandPlan[] = [
      {
        id: "node-lint",
        label: "Node lint",
        command: "npm run lint",
        reason: "Linting is useful before merge.",
        ecosystem: "node",
        required: false
      }
    ];
    const policy = policyWithCommands({
      requiredCommands: [
        {
          id: "policy-required-lint",
          label: "Policy lint",
          command: "npm run lint",
          reason: "Team policy requires lint before merge.",
          ecosystem: "general",
          required: true
        }
      ]
    });

    expect(mergePolicyCommands(existing, policy)).toEqual([
      {
        id: "policy-required-lint",
        label: "Policy lint",
        command: "npm run lint",
        reason: "Team policy requires lint before merge.",
        ecosystem: "general",
        required: true
      }
    ]);
  });

  it("keeps existing required commands required when policy repeats them as optional", () => {
    const existing: CommandPlan[] = [
      {
        id: "node-test",
        label: "Node test",
        command: "npm test",
        reason: "Node source changed.",
        ecosystem: "node",
        required: true
      }
    ];
    const policy = policyWithCommands({
      optionalCommands: [
        {
          id: "policy-optional-test",
          label: "Optional policy test",
          command: "npm test",
          reason: "Policy suggests this check.",
          ecosystem: "general",
          required: false
        }
      ]
    });

    expect(mergePolicyCommands(existing, policy)).toEqual(existing);
  });
});

function policyWithCommands(commands: Partial<Pick<PatchPolicy, "requiredCommands" | "optionalCommands">>): PatchPolicy {
  return {
    ignoredPaths: [],
    rules: [],
    requiredCommands: commands.requiredCommands ?? [],
    optionalCommands: commands.optionalCommands ?? []
  };
}
