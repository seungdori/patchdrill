import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { isSchemaName, readSchema, schemaNames } from "../src/schema.js";

describe("schemas", () => {
  it("exposes policy and report schemas using JSON Schema draft 2020-12", () => {
    expect(schemaNames).toEqual(["policy", "report"]);

    for (const name of schemaNames) {
      const schema = JSON.parse(readSchema(name)) as { $schema?: string; $defs?: Record<string, unknown> };
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.$defs).toBeDefined();
    }
  });

  it("recognizes valid schema names", () => {
    expect(isSchemaName("policy")).toBe(true);
    expect(isSchemaName("report")).toBe(true);
    expect(isSchemaName("sarif")).toBe(false);
  });

  it("documents the report contract surface", () => {
    const reportSchema = JSON.parse(readSchema("report")) as {
      required: string[];
      properties: Record<string, unknown>;
    };

    expect(reportSchema.required).toContain("schemaVersion");
    expect(reportSchema.required).toContain("summary");
    expect(reportSchema.required).toContain("dependencyChanges");
    expect(reportSchema.properties.commandResults).toBeDefined();
  });

  it("validates representative policy and report payloads", () => {
    const policy = {
      $schema: "https://patchdrill.dev/schemas/patchdrill-policy.schema.json",
      ignoredPaths: ["dist/**"],
      failOn: "high",
      maxRisk: 69,
      requiredCommands: [{ id: "unit-tests", command: "npm test", reason: "Core source changed." }],
      rules: [
        {
          id: "security-review",
          title: "Security review required",
          severity: "high",
          path: ["src/auth/**"],
          tags: ["security"]
        }
      ]
    };
    const report = {
      schemaVersion: "1",
      generatedAt: "2026-06-01T00:00:00.000Z",
      root: "/repo",
      base: "origin/main",
      head: "HEAD",
      summary: {
        status: "warn",
        riskScore: 42,
        confidenceScore: 80,
        changedFileCount: 1,
        additions: 10,
        deletions: 2,
        requiredCommandCount: 1,
        failedCommandCount: 0
      },
      changedFiles: [
        {
          path: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 2,
          binary: false,
          owners: ["@acme/platform"]
        }
      ],
      addedLines: 10,
      projectSignals: [
        {
          ecosystem: "node",
          manifestPath: "package.json",
          packageManager: "npm",
          scripts: { test: "vitest run" },
          workspacePackages: [{ name: "@acme/api", path: "packages/api", scripts: { test: "vitest run" }, dependencies: ["@acme/shared"] }]
        }
      ],
      affectedPackages: [{ name: "@acme/api", path: "packages/api", scripts: { test: "vitest run" }, dependencies: ["@acme/shared"] }],
      dependencyChanges: [
        {
          file: "package.json",
          packageName: "react",
          dependencyType: "dependencies",
          changeType: "updated",
          before: "^18.2.0",
          after: "^19.0.0"
        },
        {
          file: "package-lock.json",
          packageName: "react",
          packagePath: "node_modules/react",
          dependencyType: "lockfile",
          changeType: "updated",
          before: "18.2.0",
          after: "19.0.0"
        }
      ],
      policy: {
        path: ".patchdrill.yml",
        ignoredPaths: ["dist/**"],
        failOn: "high",
        maxRisk: 69,
        ruleCount: 1,
        requiredCommandCount: 1,
        optionalCommandCount: 0
      },
      codeOwners: {
        path: ".github/CODEOWNERS",
        ruleCount: 2
      },
      baseline: {
        path: "previous-report.json",
        previousStatus: "warn",
        currentStatus: "warn",
        previousRiskScore: 35,
        currentRiskScore: 42,
        riskDelta: 7,
        newFindingCount: 1,
        resolvedFindingCount: 0,
        unchangedFindingCount: 1
      },
      findings: [
        {
          ruleId: "risk.high-impact",
          severity: "medium",
          title: "High-impact product area changed",
          detail: "Authentication code changed.",
          file: "src/index.ts",
          line: 1,
          remediation: "Require owner review.",
          tags: ["security"]
        }
      ],
      commandPlan: [
        {
          id: "unit-tests",
          label: "Unit tests",
          command: "npm test",
          reason: "Core source changed.",
          ecosystem: "general",
          required: true,
          packageName: "@acme/api",
          packagePath: "packages/api"
        }
      ],
      commandResults: [
        {
          id: "unit-tests",
          command: "npm test",
          exitCode: 0,
          durationMs: 1200,
          stdout: "ok",
          stderr: "",
          timedOut: false
        }
      ]
    };

    expectValid("policy", policy);
    expectValid("report", report);
  });
});

function expectValid(name: "policy" | "report", value: unknown): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(JSON.parse(readSchema(name)));
  if (!validate(value)) {
    throw new Error(JSON.stringify(validate.errors, null, 2));
  }
}
