import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findAffectedWorkspacePackages, planCommands } from "../src/planner.js";
import type { ChangedFile, ProjectSignal } from "../src/types.js";

const tempDirs: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "patchdrill-planner-"));
  tempDirs.push(root);
  return root;
}

describe("planCommands", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it("adds Kubernetes manifest dry-run checks", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "k8s/deployment.yaml", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "kubernetes", manifestPath: "k8s" }]
    );

    expect(commands).toContainEqual(
      expect.objectContaining({
        id: "kubernetes-dry-run-k8s",
        command: "kubectl apply --dry-run=client -f k8s",
        required: true
      })
    );
  });

  it("narrows Bazel verification to the nearest changed package", () => {
    const root = tempRoot();
    mkdirSync(join(root, "src", "app"), { recursive: true });
    writeFileSync(join(root, "src", "app", "BUILD.bazel"), "java_library(name = \"app\")\n");

    const commands = planCommands(
      root,
      [{ path: "src/app/BUILD.bazel", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "bazel", manifestPath: "MODULE.bazel" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["bazel test //src/app/...", "bazel build //src/app/..."]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["bazel-changed-tests"]);
  });

  it("keeps Bazel graph-wide verification for root metadata changes", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "MODULE.bazel", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "bazel", manifestPath: "MODULE.bazel" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["bazel test //...", "bazel build //..."]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["bazel-tests"]);
  });

  it("narrows Buck verification to the nearest changed package", () => {
    const root = tempRoot();
    mkdirSync(join(root, "src", "app"), { recursive: true });
    writeFileSync(join(root, "src", "app", "BUCK"), "python_library(name = \"app\")\n");

    const commands = planCommands(
      root,
      [{ path: "src/app/BUCK", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "buck", manifestPath: ".buckconfig" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["buck2 test //src/app/...", "buck2 build //src/app/..."]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["buck-changed-tests"]);
  });

  it("keeps Buck graph-wide verification for root metadata changes", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: ".buckconfig", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "buck", manifestPath: ".buckconfig" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["buck2 test //...", "buck2 build //..."]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["buck-tests"]);
  });

  it("adds Swift package verification", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "Sources/App/App.swift", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "swift", manifestPath: "Package.swift" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["swift test", "swift build"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["swift-tests"]);
  });

  it("adds Django framework verification", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "templates/home.html", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", framework: "django", manifestPath: "manage.py" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["python manage.py test", "python manage.py check", "python -m compileall ."]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["django-tests", "python-compile"]);
  });

  it("adds FastAPI import smoke verification", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/main.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", entrypoint: "app.main:app", framework: "fastapi", manifestPath: "requirements.txt" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "python -m pytest",
      "python -m compileall .",
      "python -c \"import importlib, sys; sys.path[:0] = ['src', '.']; target = 'app.main:app'; module, attr = target.split(':', 1); getattr(importlib.import_module(module), attr)\""
    ]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["python-tests", "python-compile"]);
  });

  it("targets matching pytest files for Python source changes", () => {
    const root = tempRoot();
    mkdirSync(join(root, "app", "routers"), { recursive: true });
    mkdirSync(join(root, "tests", "routers"), { recursive: true });
    writeFileSync(join(root, "app", "routers", "users.py"), "def list_users():\n    return []\n");
    writeFileSync(join(root, "tests", "routers", "test_users.py"), "def test_list_users():\n    assert True\n");

    const commands = planCommands(
      root,
      [{ path: "app/routers/users.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", entrypoint: "app.main:app", framework: "fastapi", manifestPath: "requirements.txt" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "python -m pytest tests/routers/test_users.py",
      "python -m compileall .",
      "python -c \"import importlib, sys; sys.path[:0] = ['src', '.']; target = 'app.main:app'; module, attr = target.split(':', 1); getattr(importlib.import_module(module), attr)\""
    ]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["python-targeted-tests", "python-compile"]);
  });

  it("does not plan FastAPI import smoke for invalid entrypoint syntax", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/main.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", entrypoint: "app.main:app'; print('bad')", framework: "fastapi", manifestPath: "requirements.txt" }]
    );

    expect(commands.map((command) => command.id)).toEqual(["python-tests", "python-compile"]);
  });

  it("uses Gradle for Gradle projects without wrappers", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "src/main/java/com/acme/Api.java", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "java", manifestPath: "build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle test"]);
  });

  it("adds Spring Boot packaging verification", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "src/main/java/com/acme/Api.java", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "java", framework: "spring-boot", manifestPath: "build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle test", "gradle bootJar"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["java-tests"]);
  });

  it("adds Android Gradle verification", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/src/main/res/values/strings.xml", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "android", manifestPath: "app/build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle testDebugUnitTest", "gradle assembleDebug", "gradle lintDebug"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["android-debug-unit-tests"]);
  });

  it("uses Android release source sets to select release tasks", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/src/release/kotlin/com/acme/ReleaseOnly.kt", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "android", manifestPath: "app/build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle testReleaseUnitTest", "gradle assembleRelease", "gradle lintRelease"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["android-release-unit-tests"]);
  });

  it("uses Android flavor build variant source sets when present", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/src/freeDebug/java/com/acme/Feature.kt", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "android", manifestPath: "app/build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle testFreeDebugUnitTest", "gradle assembleFreeDebug", "gradle lintFreeDebug"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["android-free-debug-unit-tests"]);
  });

  it("adds .NET build verification", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "src/Api/Service.cs", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "dotnet", manifestPath: "src/Api/Api.csproj" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["dotnet test", "dotnet build --no-restore"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["dotnet-tests"]);
  });

  it("adds ASP.NET Core publish verification", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "src/Api/Program.cs", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "dotnet", framework: "aspnet-core", manifestPath: "src/Api/Api.csproj" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["dotnet test", "dotnet build --no-restore", "dotnet publish --no-restore"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["dotnet-tests"]);
  });

  it("targets .NET test projects that reference changed projects", () => {
    const root = tempRoot();
    mkdirSync(join(root, "src", "Api"), { recursive: true });
    mkdirSync(join(root, "tests", "Api.Tests"), { recursive: true });
    writeFileSync(
      join(root, "src", "Api", "Api.csproj"),
      [
        '<Project Sdk="Microsoft.NET.Sdk.Web">',
        "  <PropertyGroup>",
        "    <TargetFramework>net8.0</TargetFramework>",
        "  </PropertyGroup>",
        "</Project>"
      ].join("\n")
    );
    writeFileSync(
      join(root, "tests", "Api.Tests", "Api.Tests.csproj"),
      [
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <ItemGroup>",
        '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />',
        '    <ProjectReference Include="..\\..\\src\\Api\\Api.csproj" />',
        "  </ItemGroup>",
        "</Project>"
      ].join("\n")
    );

    const commands = planCommands(
      root,
      [{ path: "src/Api/Service.cs", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "dotnet", framework: "aspnet-core", manifestPath: "src/Api/Api.csproj" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "dotnet test tests/Api.Tests/Api.Tests.csproj",
      "dotnet build src/Api/Api.csproj --no-restore",
      "dotnet publish src/Api/Api.csproj --no-restore"
    ]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["dotnet-project-api-tests-tests"]);
  });

  it("falls back to root .NET verification when solution metadata changes", () => {
    const root = tempRoot();
    writeFileSync(join(root, "App.sln"), "Microsoft Visual Studio Solution File\n");

    const commands = planCommands(
      root,
      [{ path: "App.sln", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "dotnet", manifestPath: "App.sln" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["dotnet test", "dotnet build --no-restore"]);
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
