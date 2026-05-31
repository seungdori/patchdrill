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
});
