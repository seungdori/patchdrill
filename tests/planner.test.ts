import { describe, expect, it } from "vitest";
import { findAffectedWorkspacePackages, planCommands } from "../src/planner.js";
import type { ChangedFile, ProjectSignal } from "../src/types.js";

describe("planCommands", () => {
  it("uses package manager scripts for Node changes", () => {
    const files: ChangedFile[] = [
      { path: "src/index.ts", status: "modified", additions: 10, deletions: 2, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "pnpm",
        scripts: {
          test: "vitest run",
          typecheck: "tsc -p tsconfig.json",
          lint: "eslint ."
        }
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual(["pnpm typecheck", "pnpm lint", "pnpm test"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["node-typecheck", "node-test"]);
  });

  it("adds Terraform validation for tf files", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "infra/main.tf", status: "modified", additions: 2, deletions: 1, binary: false }],
      [{ ecosystem: "terraform", manifestPath: "*.tf" }]
    );

    expect(commands).toContainEqual(
      expect.objectContaining({
        id: "terraform-validate",
        required: true
      })
    );
  });

  it("targets changed Node workspace packages", () => {
    const files: ChangedFile[] = [
      { path: "packages/api/src/index.ts", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "pnpm",
        scripts: {
          test: "turbo run test"
        },
        workspacePackages: [
          {
            name: "@acme/api",
            path: "packages/api",
            scripts: {
              test: "vitest run",
              build: "tsc -p tsconfig.json"
            }
          },
          {
            name: "@acme/web",
            path: "apps/web",
            scripts: {
              test: "vitest run"
            }
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual(["pnpm --filter @acme/api run test", "pnpm --filter @acme/api run build"]);
    expect(commands.every((command) => command.packageName === "@acme/api")).toBe(true);
    expect(findAffectedWorkspacePackages(files, signals).map((workspacePackage) => workspacePackage.name)).toEqual(["@acme/api"]);
  });

  it("includes downstream workspace packages that depend on changed packages", () => {
    const files: ChangedFile[] = [
      { path: "packages/shared/src/index.ts", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "pnpm",
        workspacePackages: [
          {
            name: "@acme/shared",
            path: "packages/shared",
            scripts: {
              test: "vitest run"
            }
          },
          {
            name: "@acme/api",
            path: "packages/api",
            scripts: {
              test: "vitest run"
            },
            dependencies: ["@acme/shared"]
          },
          {
            name: "@acme/web",
            path: "apps/web",
            scripts: {
              test: "vitest run"
            },
            dependencies: ["@acme/api"]
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.packageName)).toEqual(["@acme/shared", "@acme/api", "@acme/web"]);
    expect(commands.map((command) => command.command)).toEqual([
      "pnpm --filter @acme/shared run test",
      "pnpm --filter @acme/api run test",
      "pnpm --filter @acme/web run test"
    ]);
    expect(commands.at(1)?.reason).toContain("depends on @acme/shared");
    expect(commands.at(2)?.reason).toContain("depends on @acme/api");
    expect(findAffectedWorkspacePackages(files, signals).map((workspacePackage) => workspacePackage.name)).toEqual(["@acme/shared", "@acme/api", "@acme/web"]);
  });

  it("uses Turborepo for affected workspace package tasks", () => {
    const files: ChangedFile[] = [
      { path: "packages/api/src/index.ts", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "pnpm",
        taskRunner: "turbo",
        workspacePackages: [
          {
            name: "@acme/api",
            path: "packages/api",
            scripts: {
              test: "vitest run",
              build: "tsc -p tsconfig.json"
            }
          },
          {
            name: "@acme/web",
            path: "apps/web",
            scripts: {
              test: "vitest run"
            },
            dependencies: ["@acme/api"]
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual([
      "pnpm exec turbo run test --filter=@acme/api",
      "pnpm exec turbo run build --filter=@acme/api",
      "pnpm exec turbo run test --filter=@acme/web"
    ]);
    expect(commands.every((command) => command.reason.includes("detected turbo"))).toBe(true);
  });

  it("uses Nx project targets when package scripts are absent", () => {
    const files: ChangedFile[] = [
      { path: "packages/api/src/index.ts", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "npm",
        taskRunner: "nx",
        workspacePackages: [
          {
            name: "@acme/api",
            projectName: "api",
            path: "packages/api",
            scripts: {},
            targets: ["build", "test"]
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual(["npx nx run api:test", "npx nx run api:build"]);
    expect(commands.map((command) => command.reason)).toEqual([
      '@acme/api changed under packages/api, and project.json defines target "test". PatchDrill detected nx and will use its task graph.',
      '@acme/api changed under packages/api, and project.json defines target "build". PatchDrill detected nx and will use its task graph.'
    ]);
  });
});
