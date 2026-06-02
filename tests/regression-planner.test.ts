import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findAffectedWorkspacePackages, planCommands } from "../src/planner.js";
import type { ChangedFile, ProjectSignal } from "../src/types.js";

const tempDirs: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-planner-"));
  tempDirs.push(root);
  return root;
}

describe("planner regressions", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("planner-0: root .NET project ownership", () => {
    // A root-level App.csproj (directory ".") must only claim root-level files,
    // not the whole tree. dotnetChangedProjects() treats a "." directory project
    // as matching only paths without a slash (or the csproj itself); see
    // src/planner.ts dotnetChangedProjects (lines 495-504).
    it("does not target the root .NET project for an unrelated nested change", () => {
      const root = tempRoot();
      mkdirSync(join(root, "src", "Worker"), { recursive: true });
      writeFileSync(
        join(root, "App.csproj"),
        [
          '<Project Sdk="Microsoft.NET.Sdk">',
          "  <ItemGroup>",
          '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />',
          "  </ItemGroup>",
          "</Project>"
        ].join("\n")
      );
      writeFileSync(join(root, "src", "Worker", "Thing.cs"), "namespace Worker;\n");

      const commands = planCommands(
        root,
        [{ path: "src/Worker/Thing.cs", status: "modified", additions: 4, deletions: 1, binary: false }],
        [{ ecosystem: "dotnet", manifestPath: "App.csproj" }]
      );

      // The nested change does not belong to the root project, so no
      // project-targeted App.csproj command is emitted.
      expect(commands.map((command) => command.command)).not.toContain("dotnet build App.csproj");
      expect(commands.map((command) => command.command)).not.toContain("dotnet build App.csproj --no-restore");
      expect(commands.map((command) => command.command)).not.toContain("dotnet test App.csproj");
      expect(commands.some((command) => command.command.includes("App.csproj"))).toBe(false);
      // No affected .NET test project, so it falls back to root-level commands.
      expect(commands.map((command) => command.command)).toEqual(["dotnet test", "dotnet build --no-restore"]);
    });

    it("targets the root .NET project for a root-level change", () => {
      const root = tempRoot();
      mkdirSync(join(root, "src", "Worker"), { recursive: true });
      writeFileSync(
        join(root, "App.csproj"),
        [
          '<Project Sdk="Microsoft.NET.Sdk">',
          "  <ItemGroup>",
          '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />',
          "  </ItemGroup>",
          "</Project>"
        ].join("\n")
      );
      writeFileSync(join(root, "Program.cs"), "class Program {}\n");
      writeFileSync(join(root, "src", "Worker", "Thing.cs"), "namespace Worker;\n");

      const commands = planCommands(
        root,
        [{ path: "Program.cs", status: "modified", additions: 4, deletions: 1, binary: false }],
        [{ ecosystem: "dotnet", manifestPath: "App.csproj" }]
      );

      // The root-level file belongs to the root project (a test project), so a
      // project-targeted command is emitted instead of the generic fallback.
      expect(commands.map((command) => command.command)).toEqual(["dotnet test App.csproj"]);
      expect(commands.map((command) => command.id)).toEqual(["dotnet-project-app-tests"]);
      expect(commands[0]?.packagePath).toBe(".");
    });

    it("targets the root .NET project when the csproj itself changes", () => {
      const root = tempRoot();
      writeFileSync(
        join(root, "App.csproj"),
        [
          '<Project Sdk="Microsoft.NET.Sdk">',
          "  <ItemGroup>",
          '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />',
          "  </ItemGroup>",
          "</Project>"
        ].join("\n")
      );

      const commands = planCommands(
        root,
        [{ path: "App.csproj", status: "modified", additions: 4, deletions: 1, binary: false }],
        [{ ecosystem: "dotnet", manifestPath: "App.csproj" }]
      );

      expect(commands.map((command) => command.command)).toEqual(["dotnet test App.csproj"]);
      expect(commands.map((command) => command.id)).toEqual(["dotnet-project-app-tests"]);
    });
  });

  describe("planner-1: nested workspace package attribution", () => {
    // directlyAffectedPackagesForSignal() attributes each path to its single
    // most-specific (longest matching) package, so a file confined to a nested
    // child package does not also mark the enclosing parent as directly changed
    // (src/planner.ts lines 2119-2136). The parent is only added if it declares
    // a dependency on the child (includeDownstreamDependents, lines 2138-2153).
    const childOnlyChange: ChangedFile[] = [
      { path: "packages/a/nested/index.ts", status: "modified", additions: 4, deletions: 1, binary: false }
    ];

    it("marks only the nested child package affected when the parent has no dependency", () => {
      const signals: ProjectSignal[] = [
        {
          ecosystem: "node",
          manifestPath: "package.json",
          packageManager: "pnpm",
          workspacePackages: [
            { name: "@acme/a", path: "packages/a", scripts: { test: "vitest run" } },
            { name: "@acme/nested", path: "packages/a/nested", scripts: { test: "vitest run" } }
          ]
        }
      ];

      expect(findAffectedWorkspacePackages(childOnlyChange, signals).map((workspacePackage) => workspacePackage.name)).toEqual(["@acme/nested"]);

      const commands = planCommands(process.cwd(), childOnlyChange, signals);
      expect(commands.map((command) => command.command)).toEqual(["pnpm --filter @acme/nested run test"]);
      expect(commands.map((command) => command.packageName)).toEqual(["@acme/nested"]);
      expect(commands.map((command) => command.id)).toEqual(["node-workspace-acme-nested-test"]);
    });

    it("includes the parent only when it declares a dependency on the nested child", () => {
      const signals: ProjectSignal[] = [
        {
          ecosystem: "node",
          manifestPath: "package.json",
          packageManager: "pnpm",
          workspacePackages: [
            { name: "@acme/a", path: "packages/a", scripts: { test: "vitest run" }, dependencies: ["@acme/nested"] },
            { name: "@acme/nested", path: "packages/a/nested", scripts: { test: "vitest run" } }
          ]
        }
      ];

      expect(findAffectedWorkspacePackages(childOnlyChange, signals).map((workspacePackage) => workspacePackage.name)).toEqual([
        "@acme/nested",
        "@acme/a"
      ]);

      const commands = planCommands(process.cwd(), childOnlyChange, signals);
      expect(commands.map((command) => command.packageName)).toEqual(["@acme/nested", "@acme/a"]);
      expect(commands.map((command) => command.command)).toEqual([
        "pnpm --filter @acme/nested run test",
        "pnpm --filter @acme/a run test"
      ]);
      expect(commands.at(1)?.reason).toContain("depends on @acme/nested");
    });
  });

  describe("planner-2: filename-token suffix matching", () => {
    // matchesToken() (src/planner.ts lines 2519-2525) matches extension tokens
    // (".ts") by suffix, but filename tokens ("package.json", "go.mod") must
    // match the whole path or a complete path segment, so "mypackage.json" and
    // "x.go.mod" no longer falsely activate the node/go ecosystems.
    const nodeSignal: ProjectSignal[] = [
      { ecosystem: "node", manifestPath: "package.json", packageManager: "npm", scripts: { test: "vitest run" } }
    ];
    const goSignal: ProjectSignal[] = [{ ecosystem: "go", manifestPath: "go.mod" }];

    function changed(path: string): ChangedFile[] {
      return [{ path, status: "modified", additions: 4, deletions: 1, binary: false }];
    }

    it("does not activate node for a filename that merely ends with package.json", () => {
      const commands = planCommands(process.cwd(), changed("app/mypackage.json"), nodeSignal);
      expect(commands).toEqual([]);
    });

    it("activates node for a real package.json segment", () => {
      expect(planCommands(process.cwd(), changed("package.json"), nodeSignal).map((command) => command.command)).toEqual(["npm run test"]);
      expect(planCommands(process.cwd(), changed("src/package.json"), nodeSignal).map((command) => command.command)).toEqual(["npm run test"]);
    });

    it("does not activate go for a filename that merely ends with go.mod", () => {
      const commands = planCommands(process.cwd(), changed("x.go.mod"), goSignal);
      expect(commands).toEqual([]);
    });

    it("activates go for a real go.mod segment", () => {
      expect(planCommands(process.cwd(), changed("go.mod"), goSignal).map((command) => command.command)).toEqual(["go test ./...", "go vet ./..."]);
      expect(planCommands(process.cwd(), changed("src/go.mod"), goSignal).map((command) => command.command)).toEqual(["go test ./...", "go vet ./..."]);
    });
  });
});
