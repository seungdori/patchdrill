import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { inspectDoctor } from "../src/doctor.js";
import { checkReleaseReadiness, createReleaseReadinessReport } from "../src/release-readiness.js";
import { isSchemaName, listSchemas, readSchema, schemaFileName, schemaNames } from "../src/schema.js";

describe("schemas", () => {
  it("exposes public schemas using JSON Schema draft 2020-12", () => {
    expect(schemaNames).toEqual(["policy", "report", "evidence", "doctor", "release-check"]);
    expect(listSchemas().map(({ name, fileName }) => [name, fileName])).toEqual([
      ["policy", "patchdrill-policy.schema.json"],
      ["report", "patchdrill-report.schema.json"],
      ["evidence", "patchdrill-evidence.schema.json"],
      ["doctor", "patchdrill-doctor.schema.json"],
      ["release-check", "patchdrill-release-check.schema.json"]
    ]);

    for (const name of schemaNames) {
      const schema = JSON.parse(readSchema(name)) as { $schema?: string; $id?: string; $defs?: Record<string, unknown> };
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.$id).toBe(`https://patchdrill.dev/schemas/${schemaFileName(name)}`);
      expect(schema.$defs).toBeDefined();
    }
  });

  it("recognizes valid schema names", () => {
    expect(isSchemaName("policy")).toBe(true);
    expect(isSchemaName("report")).toBe(true);
    expect(isSchemaName("evidence")).toBe(true);
    expect(isSchemaName("doctor")).toBe(true);
    expect(isSchemaName("release-check")).toBe(true);
    expect(isSchemaName("sarif")).toBe(false);
  });

  it("documents the report contract surface", () => {
    const reportSchema = JSON.parse(readSchema("report")) as {
      required: string[];
      properties: Record<string, unknown>;
      $defs: {
        ecosystem?: { enum?: string[] };
        commandEcosystem?: { enum?: string[] };
        projectSignal?: { properties?: { framework?: { enum?: string[] } } };
      };
    };

    expect(reportSchema.required).toContain("schemaVersion");
    expect(reportSchema.required).toContain("summary");
    expect(reportSchema.required).toContain("dependencyChanges");
    expect(reportSchema.required).toContain("packageScriptChanges");
    expect(reportSchema.$defs.ecosystem?.enum).toContain("kubernetes");
    expect(reportSchema.$defs.ecosystem?.enum).toContain("bazel");
    expect(reportSchema.$defs.ecosystem?.enum).toContain("buck");
    expect(reportSchema.$defs.ecosystem?.enum).toContain("swift");
    expect(reportSchema.$defs.ecosystem?.enum).toContain("xcode");
    expect(reportSchema.$defs.ecosystem?.enum).toContain("android");
    expect(reportSchema.$defs.commandEcosystem?.enum).toContain("kubernetes");
    expect(reportSchema.$defs.commandEcosystem?.enum).toContain("bazel");
    expect(reportSchema.$defs.commandEcosystem?.enum).toContain("buck");
    expect(reportSchema.$defs.commandEcosystem?.enum).toContain("swift");
    expect(reportSchema.$defs.commandEcosystem?.enum).toContain("xcode");
    expect(reportSchema.$defs.commandEcosystem?.enum).toContain("android");
    expect(reportSchema.$defs.projectSignal?.properties?.framework?.enum).toEqual(["django", "fastapi", "spring-boot", "rails", "laravel", "aspnet-core"]);
    expect(reportSchema.properties.commandResults).toBeDefined();
  });

  it("documents the evidence manifest contract surface", () => {
    const evidenceSchema = JSON.parse(readSchema("evidence")) as {
      required: string[];
      properties: Record<string, unknown>;
      $defs: {
        artifact?: { properties?: { kind?: { enum?: string[] } } };
      };
    };

    expect(evidenceSchema.required).toContain("schemaVersion");
    expect(evidenceSchema.required).toContain("report");
    expect(evidenceSchema.required).toContain("artifacts");
    expect(evidenceSchema.required).toContain("commands");
    expect(evidenceSchema.properties.git).toBeDefined();
    expect(evidenceSchema.$defs.artifact?.properties?.kind?.enum).toEqual(["summary-markdown", "markdown", "json", "sarif", "html"]);
  });

  it("documents readiness automation contract surfaces", () => {
    const doctorSchema = JSON.parse(readSchema("doctor")) as {
      required: string[];
      $defs: {
        doctorCheck?: { properties?: { status?: { $ref?: string } } };
        doctorStatus?: { enum?: string[] };
      };
    };
    const releaseSchema = JSON.parse(readSchema("release-check")) as {
      required: string[];
      $defs: {
        releaseCheck?: { properties?: { status?: { $ref?: string } } };
        releaseStatus?: { enum?: string[] };
      };
    };

    expect(doctorSchema.required).toEqual(["schemaVersion", "root", "summary", "projectSignals", "checks", "suggestedCommands"]);
    expect(doctorSchema.$defs.doctorStatus?.enum).toEqual(["pass", "warn", "info"]);
    expect(doctorSchema.$defs.doctorCheck?.properties?.status?.$ref).toBe("#/$defs/doctorStatus");
    expect(releaseSchema.required).toEqual(["schemaVersion", "ok", "summary", "checks"]);
    expect(releaseSchema.$defs.releaseStatus?.enum).toEqual(["pass", "warn", "fail"]);
    expect(releaseSchema.$defs.releaseCheck?.properties?.status?.$ref).toBe("#/$defs/releaseStatus");
  });

  it("validates representative policy, report, evidence, and readiness payloads", () => {
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
          taskRunner: "nx",
          scripts: { test: "vitest run" },
          workspacePackages: [
            {
              name: "@acme/api",
              projectName: "api",
              path: "packages/api",
              scripts: { test: "vitest run" },
              targets: ["test"],
              dependencies: ["@acme/shared"]
            }
          ]
        },
        {
          ecosystem: "python",
          entrypoint: "app.main:app",
          framework: "fastapi",
          manifestPath: "pyproject.toml"
        },
        {
          ecosystem: "java",
          framework: "spring-boot",
          manifestPath: "build.gradle"
        },
        {
          ecosystem: "ruby",
          framework: "rails",
          manifestPath: "Gemfile"
        },
        {
          ecosystem: "php",
          framework: "laravel",
          manifestPath: "composer.json",
          scripts: { test: "phpunit" }
        },
        {
          ecosystem: "android",
          manifestPath: "app/build.gradle"
        },
        {
          ecosystem: "xcode",
          manifestPath: "App.xcodeproj"
        },
        {
          ecosystem: "dotnet",
          framework: "aspnet-core",
          manifestPath: "src/Api/Api.csproj"
        }
      ],
      affectedPackages: [
        {
          name: "@acme/api",
          projectName: "api",
          path: "packages/api",
          scripts: { test: "vitest run" },
          targets: ["test"],
          dependencies: ["@acme/shared"]
        }
      ],
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
      packageScriptChanges: [
        {
          file: "package.json",
          scriptName: "test",
          changeType: "updated",
          before: "vitest run",
          after: "true"
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
    const evidence = {
      schemaVersion: "1",
      generatedAt: "2026-06-01T00:00:00.000Z",
      tool: {
        name: "patchdrill",
        reportSchemaVersion: "1",
        version: "0.1.0"
      },
      root: "/repo",
      base: "origin/main",
      head: "HEAD",
      git: {
        branch: "main",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        baseSha: "89abcdef0123456789abcdef0123456789abcdef"
      },
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
      report: {
        sha256: "a".repeat(64),
        bytes: 1000,
        findingCount: 1,
        commandPlanCount: 1,
        commandResultCount: 1
      },
      artifacts: [
        {
          kind: "json",
          path: "patchdrill-report.json",
          sha256: "b".repeat(64),
          bytes: 1000
        }
      ],
      commands: [
        {
          id: "unit-tests",
          command: "npm test",
          exitCode: 0,
          durationMs: 1200,
          stdout: {
            sha256: "c".repeat(64),
            bytes: 2
          },
          stderr: {
            sha256: "d".repeat(64),
            bytes: 0
          }
        }
      ]
    };
    const doctor = {
      schemaVersion: "1",
      root: "/repo",
      summary: {
        status: "pass",
        ok: true,
        passCount: 2,
        warnCount: 0,
        infoCount: 1,
        projectSignalCount: 1
      },
      projectSignals: [
        {
          ecosystem: "node",
          manifestPath: "package.json",
          packageManager: "npm",
          scripts: { test: "vitest run" }
        }
      ],
      checks: [
        {
          status: "pass",
          title: "Project detection",
          detail: "1 project signal detected."
        },
        {
          status: "info",
          title: "CODEOWNERS",
          detail: "No CODEOWNERS file was found.",
          remediation: "Add CODEOWNERS if owner hints should appear."
        }
      ],
      suggestedCommands: ["patchdrill scan --base origin/main"]
    };
    const releaseCheck = {
      schemaVersion: "1",
      ok: true,
      summary: {
        status: "pass",
        ok: true,
        passCount: 2,
        warnCount: 1,
        failCount: 0
      },
      checks: [
        {
          status: "pass",
          title: "Package name",
          detail: "name is patchdrill."
        },
        {
          status: "warn",
          title: "npm Trusted Publisher",
          detail: "Trusted Publisher configuration must be verified in npm account settings.",
          remediation: "Configure npm trusted publishing."
        }
      ]
    };

    expectValid("policy", policy);
    expectValid("report", report);
    expectValid("evidence", evidence);
    expectValid("doctor", doctor);
    expectValid("release-check", releaseCheck);
  });

  it("validates live readiness outputs against their shipped schemas", () => {
    expectValid("doctor", inspectDoctor(process.cwd()));
    expectValid("release-check", createReleaseReadinessReport(checkReleaseReadiness(process.cwd())));
  });

  it("rejects policy alias conflicts in schema validation", () => {
    expectInvalid("policy", {
      ignoredPaths: ["generated/**"],
      ignore: ["dist/**"]
    });
    expectInvalid("policy", {
      rules: [
        {
          id: "review",
          title: "Review required",
          severity: "high",
          path: "src/**",
          paths: ["services/**"]
        }
      ]
    });
  });
});

function expectValid(name: (typeof schemaNames)[number], value: unknown): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(JSON.parse(readSchema(name)));
  if (!validate(value)) {
    throw new Error(JSON.stringify(validate.errors, null, 2));
  }
}

function expectInvalid(name: (typeof schemaNames)[number], value: unknown): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(JSON.parse(readSchema(name)));
  expect(validate(value)).toBe(false);
}
