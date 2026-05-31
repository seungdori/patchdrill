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

  it("targets affected Cargo workspace crates and downstream dependents", () => {
    const files: ChangedFile[] = [
      { path: "crates/core/src/lib.rs", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "rust",
        manifestPath: "Cargo.toml",
        workspacePackages: [
          {
            name: "core-lib",
            path: "crates/core",
            scripts: {}
          },
          {
            name: "api-server",
            path: "crates/api",
            scripts: {},
            dependencies: ["core-lib"]
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual([
      "cargo test -p core-lib --all-targets",
      "cargo clippy -p core-lib --all-targets -- -D warnings",
      "cargo test -p api-server --all-targets",
      "cargo clippy -p api-server --all-targets -- -D warnings"
    ]);
    expect(commands.map((command) => command.packageName)).toEqual(["core-lib", "core-lib", "api-server", "api-server"]);
    expect(findAffectedWorkspacePackages(files, signals).map((workspacePackage) => workspacePackage.name)).toEqual(["core-lib", "api-server"]);
  });

  it("targets affected Go workspace modules and downstream dependents", () => {
    const files: ChangedFile[] = [
      { path: "modules/core/core.go", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "go",
        manifestPath: "go.work",
        workspacePackages: [
          {
            name: "example.com/core",
            path: "modules/core",
            scripts: {}
          },
          {
            name: "example.com/api",
            path: "modules/api",
            scripts: {},
            dependencies: ["example.com/core"]
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual([
      "go test ./modules/core/...",
      "go vet ./modules/core/...",
      "go test ./modules/api/...",
      "go vet ./modules/api/..."
    ]);
    expect(commands.map((command) => command.packageName)).toEqual(["example.com/core", "example.com/core", "example.com/api", "example.com/api"]);
    expect(findAffectedWorkspacePackages(files, signals).map((workspacePackage) => workspacePackage.name)).toEqual(["example.com/core", "example.com/api"]);
  });

  it("uses Pants native changed target selection", () => {
    const files: ChangedFile[] = [
      { path: "src/python/app/service.py", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [{ ecosystem: "pants", manifestPath: "pants.toml" }];

    const commands = planCommands(process.cwd(), files, signals, { changedSince: "origin/main" });

    expect(commands.map((command) => command.command)).toEqual([
      "pants --changed-since=origin/main --changed-dependents=transitive test",
      "pants --changed-since=origin/main --changed-dependents=transitive lint",
      "pants --changed-since=origin/main --changed-dependents=transitive check"
    ]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["pants-changed-tests"]);
  });
});
