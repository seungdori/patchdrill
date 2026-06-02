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

  it("uses common Node script aliases for typecheck, unit, and browser tests", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "src/page.tsx", status: "modified", additions: 10, deletions: 2, binary: false }],
      [
        {
          ecosystem: "node",
          manifestPath: "package.json",
          packageManager: "npm",
          scripts: {
            "check:types": "tsc --noEmit",
            "test:unit": "vitest run",
            build: "vite build",
            "test:e2e": "playwright test"
          }
        }
      ]
    );

    expect(commands.map((command) => command.command)).toEqual(["npm run check:types", "npm run test:unit", "npm run build", "npm run test:e2e"]);
    expect(commands.map((command) => command.id)).toEqual(["node-typecheck", "node-test", "node-build", "node-e2e"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["node-typecheck", "node-test", "node-build"]);
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

    expect(commands.map((command) => command.command)).toEqual([
      "bazel test //src/app/...",
      "bazel build //src/app/...",
      "bazel query 'rdeps(//..., set(//src/app/...))'",
      "targets=\"$(bazel query 'tests(rdeps(//..., set(//src/app/...)))')\" && if [ -n \"$targets\" ]; then bazel test $targets; else echo 'No downstream Bazel tests found'; fi"
    ]);
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

    expect(commands.map((command) => command.command)).toEqual([
      "buck2 test //src/app/...",
      "buck2 build //src/app/...",
      "buck2 uquery 'rdeps(//..., set(//src/app/...))'",
      "targets=\"$(buck2 uquery 'testsof(rdeps(//..., set(//src/app/...)))')\" && if [ -n \"$targets\" ]; then buck2 test $targets; else echo 'No downstream Buck tests found'; fi"
    ]);
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

  it("adds Xcode scheme-aware project verification", () => {
    const root = tempRoot();
    mkdirSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    writeFileSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes", "App.xcscheme"), "<Scheme></Scheme>\n");

    const commands = planCommands(
      root,
      [{ path: "App/Sources/ContentView.swift", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "xcode", manifestPath: "App.xcodeproj" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "xcodebuild -project App.xcodeproj -scheme App test",
      "xcodebuild -project App.xcodeproj -scheme App build"
    ]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["xcode-app-tests"]);
  });

  it("adds Xcode scheme-aware workspace verification", () => {
    const root = tempRoot();
    mkdirSync(join(root, "App.xcworkspace", "xcshareddata", "xcschemes"), { recursive: true });
    writeFileSync(join(root, "App.xcworkspace", "xcshareddata", "xcschemes", "App QA.xcscheme"), "<Scheme></Scheme>\n");

    const commands = planCommands(
      root,
      [{ path: "App/AppDelegate.swift", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "xcode", manifestPath: "App.xcworkspace" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "xcodebuild -workspace App.xcworkspace -scheme 'App QA' test",
      "xcodebuild -workspace App.xcworkspace -scheme 'App QA' build"
    ]);
  });

  it("adds Xcode test-plan-aware test verification", () => {
    const root = tempRoot();
    mkdirSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    writeFileSync(
      join(root, "App.xcodeproj", "xcshareddata", "xcschemes", "App.xcscheme"),
      [
        "<Scheme>",
        "  <TestAction>",
        "    <TestPlans>",
        "      <TestPlanReference reference=\"container:AppTests.xctestplan\" default=\"YES\" />",
        "    </TestPlans>",
        "  </TestAction>",
        "</Scheme>"
      ].join("\n")
    );

    const commands = planCommands(
      root,
      [{ path: "AppTests/AppTests.xctestplan", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "xcode", manifestPath: "App.xcodeproj" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "xcodebuild -project App.xcodeproj -scheme App -testPlan AppTests test",
      "xcodebuild -project App.xcodeproj -scheme App build"
    ]);
    expect(commands[0]?.reason).toContain("test plan AppTests");
  });

  it("adds macOS destination-aware Xcode verification", () => {
    const root = tempRoot();
    mkdirSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    writeFileSync(join(root, "App.xcodeproj", "project.pbxproj"), xcodeProject("macosx"));
    writeFileSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes", "App.xcscheme"), xcodeScheme());

    const commands = planCommands(
      root,
      [{ path: "App/Sources/AppDelegate.swift", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "xcode", manifestPath: "App.xcodeproj" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "xcodebuild -project App.xcodeproj -scheme App -destination platform=macOS test",
      "xcodebuild -project App.xcodeproj -scheme App -destination platform=macOS build"
    ]);
    expect(commands[0]?.reason).toContain("on macOS");
  });

  it.each([
    ["iphoneos", "iOS"],
    ["appletvos", "tvOS"],
    ["xros", "visionOS"],
    ["watchos", "watchOS"]
  ])("adds %s generic build destinations and destination discovery for Xcode tests", (sdkRoot, platform) => {
    const root = tempRoot();
    mkdirSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    writeFileSync(join(root, "App.xcodeproj", "project.pbxproj"), xcodeProject(sdkRoot));
    writeFileSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes", "App.xcscheme"), xcodeScheme());

    const commands = planCommands(
      root,
      [{ path: "App/Sources/ContentView.swift", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "xcode", manifestPath: "App.xcodeproj" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "xcodebuild -project App.xcodeproj -scheme App test",
      "xcodebuild -project App.xcodeproj -scheme App -showdestinations",
      `xcodebuild -project App.xcodeproj -scheme App -destination generic/platform=${platform} build`
    ]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["xcode-app-tests"]);
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

  it("uses Python environment runners and optional static analysis plans", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "pyproject.toml"),
      [
        "[project]",
        "dependencies = [\"pytest\", \"ruff\", \"mypy\", \"pyright\"]",
        "",
        "[tool.ruff]",
        "line-length = 120",
        "",
        "[tool.mypy]",
        "strict = true",
        "",
        "[tool.pyright]",
        "typeCheckingMode = \"strict\"",
        ""
      ].join("\n")
    );
    writeFileSync(join(root, "uv.lock"), "");

    const commands = planCommands(
      root,
      [{ path: "app/service.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", manifestPath: "pyproject.toml" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "uv run pytest",
      "python -m compileall .",
      "uv run ruff check .",
      "uv run mypy .",
      "uv run pyright"
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
      "python -c \"import importlib, sys; sys.path[:0] = ['src', '.']; target = 'app.main:app'; module, attr = target.split(':', 1); getattr(importlib.import_module(module), attr)\"",
      "python -c \"import importlib, sys; sys.path[:0] = ['src', '.']; targets = ['app.routers.users']; [importlib.import_module(target) for target in targets]\""
    ]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["python-targeted-tests", "python-compile"]);
  });

  it("scopes Python verification to nested package roots", () => {
    const root = tempRoot();
    mkdirSync(join(root, "packages", "pine-engine", "pine_runtime"), { recursive: true });
    mkdirSync(join(root, "packages", "pine-engine", "tests"), { recursive: true });
    writeFileSync(join(root, "packages", "pine-engine", "uv.lock"), "");
    writeFileSync(join(root, "packages", "pine-engine", "pine_runtime", "engine_htf.py"), "def run():\n    return True\n");
    writeFileSync(join(root, "packages", "pine-engine", "tests", "test_engine_htf.py"), "def test_run():\n    assert True\n");

    const commands = planCommands(
      root,
      [{ path: "packages/pine-engine/pine_runtime/engine_htf.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", manifestPath: "packages/pine-engine/pyproject.toml" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "cd packages/pine-engine && uv run pytest tests/test_engine_htf.py",
      "cd packages/pine-engine && python -m compileall ."
    ]);
    expect(commands.map((command) => command.id)).toEqual(["python-targeted-tests-packages-pine-engine", "python-compile-packages-pine-engine"]);
    expect(commands.map((command) => command.packagePath)).toEqual(["packages/pine-engine", "packages/pine-engine"]);
  });

  it("adds FastAPI dependency module import smoke for changed dependency helpers", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/dependencies.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", entrypoint: "app.main:app", framework: "fastapi", manifestPath: "requirements.txt" }]
    );

    expect(commands.map((command) => command.command)).toContain(
      "python -c \"import importlib, sys; sys.path[:0] = ['src', '.']; targets = ['app.dependencies']; [importlib.import_module(target) for target in targets]\""
    );
    expect(commands.find((command) => command.id === "fastapi-module-import-smoke")).toMatchObject({
      required: false,
      ecosystem: "python"
    });
  });

  it("targets FastAPI dependency override tests for changed dependency helpers", () => {
    const root = tempRoot();
    mkdirSync(join(root, "app"), { recursive: true });
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(
      join(root, "app", "dependencies.py"),
      ["async def get_current_user():", "    return {\"id\": \"real\"}", ""].join("\n")
    );
    writeFileSync(
      join(root, "tests", "test_auth.py"),
      [
        "from app.main import app",
        "from app.dependencies import get_current_user",
        "",
        "async def override_current_user():",
        "    return {\"id\": \"test\"}",
        "",
        "app.dependency_overrides[get_current_user] = override_current_user",
        "",
        "def test_auth_route():",
        "    assert True",
        ""
      ].join("\n")
    );
    writeFileSync(
      join(root, "tests", "test_unrelated.py"),
      ["from app.main import app", "app.dependency_overrides[object] = object", "def test_other():", "    assert True", ""].join("\n")
    );

    const commands = planCommands(
      root,
      [{ path: "app/dependencies.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", entrypoint: "app.main:app", framework: "fastapi", manifestPath: "requirements.txt" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "python -m pytest tests/test_auth.py",
      "python -m compileall .",
      "python -c \"import importlib, sys; sys.path[:0] = ['src', '.']; target = 'app.main:app'; module, attr = target.split(':', 1); getattr(importlib.import_module(module), attr)\"",
      "python -c \"import importlib, sys; sys.path[:0] = ['src', '.']; targets = ['app.dependencies']; [importlib.import_module(target) for target in targets]\""
    ]);
    expect(commands.find((command) => command.id === "python-targeted-tests")?.reason).toContain("matching changed-test or FastAPI dependency override targets");
  });

  it("does not plan FastAPI import smoke for invalid entrypoint syntax", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/main.py", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "python", entrypoint: "app.main:app'; print('bad')", framework: "fastapi", manifestPath: "requirements.txt" }]
    );

    expect(commands.map((command) => command.id)).toEqual(["python-tests", "python-compile"]);
  });

  it("uses the Rails test runner when a Rails binstub exists", () => {
    const root = tempRoot();
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "bin", "rails"), "#!/usr/bin/env ruby\n");

    const commands = planCommands(
      root,
      [{ path: "app/models/user.rb", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "ruby", framework: "rails", manifestPath: "Gemfile" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["bin/rails test"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["rails-tests"]);
  });

  it("uses RSpec when a Ruby project declares RSpec", () => {
    const root = tempRoot();
    writeFileSync(join(root, "Gemfile"), "source \"https://rubygems.org\"\ngem \"rspec-rails\"\n");

    const commands = planCommands(
      root,
      [{ path: "app/models/user.rb", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "ruby", framework: "rails", manifestPath: "Gemfile" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["bundle exec rspec"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["ruby-rspec"]);
  });

  it("validates Composer metadata and runs Composer test scripts", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "composer.json", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "php", manifestPath: "composer.json", scripts: { test: "phpunit" } }]
    );

    expect(commands.map((command) => command.command)).toEqual(["composer validate --strict", "composer test"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["php-composer-validate", "php-composer-test"]);
  });

  it("uses Laravel's test runner when Composer has no test script", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/Services/UserService.php", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "php", framework: "laravel", manifestPath: "composer.json" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["php artisan test"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["laravel-tests"]);
  });

  it("uses PHPUnit when PHPUnit configuration is present", () => {
    const root = tempRoot();
    writeFileSync(join(root, "phpunit.xml.dist"), "<phpunit />\n");

    const commands = planCommands(
      root,
      [{ path: "src/Service.php", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "php", manifestPath: "composer.json" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["vendor/bin/phpunit"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["phpunit-tests"]);
  });

  it("falls back to PHP syntax checks when no PHP test runner is detected", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "src/Service.php", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "php", manifestPath: "composer.json" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["find . -name '*.php' -not -path './vendor/*' -exec php -l {} \\;"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["php-syntax-check"]);
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

  it("uses Android product flavor source sets to select flavor debug tasks", () => {
    const root = tempRoot();
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(
      join(root, "app", "build.gradle"),
      [
        "plugins { id 'com.android.application' }",
        "android {",
        "  flavorDimensions 'tier'",
        "  productFlavors {",
        "    free { dimension 'tier' }",
        "    paid { dimension 'tier' }",
        "  }",
        "}"
      ].join("\n")
    );

    const commands = planCommands(
      root,
      [{ path: "app/src/free/java/com/acme/Feature.kt", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "android", manifestPath: "app/build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle testFreeDebugUnitTest", "gradle assembleFreeDebug", "gradle lintFreeDebug"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["android-free-debug-unit-tests"]);
  });

  it("uses Android multi-flavor combination source sets to select debug tasks", () => {
    const root = tempRoot();
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(
      join(root, "app", "build.gradle.kts"),
      [
        "plugins { id(\"com.android.application\") }",
        "android {",
        "  flavorDimensions += listOf(\"api\", \"mode\")",
        "  productFlavors {",
        "    create(\"minApi24\") { dimension = \"api\" }",
        "    create(\"minApi21\") { dimension = \"api\" }",
        "    create(\"demo\") { dimension = \"mode\" }",
        "    create(\"full\") { dimension = \"mode\" }",
        "  }",
        "}"
      ].join("\n")
    );

    const commands = planCommands(
      root,
      [{ path: "app/src/minApi24Demo/kotlin/com/acme/Feature.kt", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "android", manifestPath: "app/build.gradle.kts" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle testMinApi24DemoDebugUnitTest", "gradle assembleMinApi24DemoDebug", "gradle lintMinApi24DemoDebug"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["android-min-api24-demo-debug-unit-tests"]);
  });

  it("uses Android generated source paths to select build variants", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "app/build/generated/source/kapt/release/com/acme/GeneratedMapper.kt", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "android", manifestPath: "app/build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle testReleaseUnitTest", "gradle assembleRelease", "gradle lintRelease"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["android-release-unit-tests"]);
  });

  it("avoids Android variants disabled by variantFilter", () => {
    const root = tempRoot();
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(
      join(root, "app", "build.gradle"),
      [
        "plugins { id 'com.android.application' }",
        "android {",
        "  flavorDimensions 'tier'",
        "  productFlavors {",
        "    free { dimension 'tier' }",
        "    paid { dimension 'tier' }",
        "  }",
        "  variantFilter { variant ->",
        "    if (variant.flavors*.name.contains('paid') && variant.buildType.name == 'release') {",
        "      setIgnore(true)",
        "    }",
        "  }",
        "}"
      ].join("\n")
    );

    const commands = planCommands(
      root,
      [{ path: "app/src/paidRelease/java/com/acme/PaidOnly.kt", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "android", manifestPath: "app/build.gradle" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["gradle testPaidDebugUnitTest", "gradle assemblePaidDebug", "gradle lintPaidDebug"]);
    expect(commands[0]?.reason).toContain("PaidDebug JVM unit tests");
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

  it("targets .NET solution filters when filter metadata changes", () => {
    const root = tempRoot();
    writeFileSync(join(root, "App.sln"), "Microsoft Visual Studio Solution File\n");
    writeFileSync(join(root, "App.slnf"), JSON.stringify({ solution: { path: "App.sln", projects: ["src/Api/Api.csproj"] } }, null, 2));

    const commands = planCommands(
      root,
      [{ path: "App.slnf", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "dotnet", manifestPath: "App.slnf" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["dotnet test App.slnf", "dotnet build App.slnf --no-restore"]);
    expect(commands.map((command) => command.reason)).toEqual([
      ".NET solution filter App.slnf changed, so tests should run against the filtered solution.",
      ".NET solution filter App.slnf changed, so the filtered solution should still compile."
    ]);
  });

  it("selects narrow .NET solution filters that cover affected test projects", () => {
    const root = tempRoot();
    mkdirSync(join(root, "src", "Api"), { recursive: true });
    mkdirSync(join(root, "src", "Admin"), { recursive: true });
    mkdirSync(join(root, "tests", "Api.Tests"), { recursive: true });
    writeFileSync(join(root, "App.sln"), "Microsoft Visual Studio Solution File\n");
    writeFileSync(
      join(root, "Api.slnf"),
      JSON.stringify({ solution: { path: "App.sln", projects: ["src/Api/Api.csproj", "tests/Api.Tests/Api.Tests.csproj"] } }, null, 2)
    );
    writeFileSync(
      join(root, "All.slnf"),
      JSON.stringify(
        { solution: { path: "App.sln", projects: ["src/Api/Api.csproj", "src/Admin/Admin.csproj", "tests/Api.Tests/Api.Tests.csproj"] } },
        null,
        2
      )
    );
    writeFileSync(join(root, "src", "Api", "Api.csproj"), '<Project Sdk="Microsoft.NET.Sdk" />\n');
    writeFileSync(join(root, "src", "Admin", "Admin.csproj"), '<Project Sdk="Microsoft.NET.Sdk" />\n');
    writeFileSync(
      join(root, "tests", "Api.Tests", "Api.Tests.csproj"),
      [
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <ItemGroup>",
        '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />',
        '    <ProjectReference Include="../../src/Api/Api.csproj" />',
        "  </ItemGroup>",
        "</Project>"
      ].join("\n")
    );

    const commands = planCommands(
      root,
      [{ path: "src/Api/Service.cs", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "dotnet", manifestPath: "App.sln" }]
    );

    expect(commands.map((command) => command.command)).toEqual(["dotnet test Api.slnf", "dotnet build Api.slnf --no-restore"]);
    expect(commands.map((command) => command.reason)).toEqual([
      "Api.slnf covers affected .NET test projects for changed src/Api/Api.csproj, so tests should run through that solution filter.",
      "Api.slnf covers affected .NET projects for changed src/Api/Api.csproj, so the filtered solution should still compile."
    ]);
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

  it("uses workspace Node script aliases with task runners", () => {
    const files: ChangedFile[] = [
      { path: "apps/web/src/page.tsx", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "node",
        manifestPath: "package.json",
        packageManager: "pnpm",
        taskRunner: "turbo",
        workspacePackages: [
          {
            name: "@acme/web",
            path: "apps/web",
            scripts: {
              "check:types": "tsc --noEmit",
              "test:unit": "vitest run",
              "test:e2e": "playwright test"
            }
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual([
      "pnpm exec turbo run check:types --filter=@acme/web",
      "pnpm exec turbo run test:unit --filter=@acme/web",
      "pnpm exec turbo run test:e2e --filter=@acme/web"
    ]);
    expect(commands.map((command) => command.id)).toEqual(["node-turbo-acme-web-typecheck", "node-turbo-acme-web-test", "node-turbo-acme-web-e2e"]);
    expect(commands.filter((command) => command.required).map((command) => command.id)).toEqual(["node-turbo-acme-web-typecheck", "node-turbo-acme-web-test"]);
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

  it("targets nested Cargo workspace crates through manifest-path commands", () => {
    const files: ChangedFile[] = [
      { path: "packages/pine-wasm/crates/pine-core/src/engine.rs", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "rust",
        manifestPath: "packages/pine-wasm/Cargo.toml",
        workspacePackages: [
          {
            name: "pine-core",
            path: "packages/pine-wasm/crates/pine-core",
            scripts: {}
          },
          {
            name: "pine-native",
            path: "packages/pine-wasm/crates/pine-native",
            scripts: {},
            dependencies: ["pine-core"]
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual([
      "cargo test --manifest-path packages/pine-wasm/Cargo.toml -p pine-core --all-targets",
      "cargo clippy --manifest-path packages/pine-wasm/Cargo.toml -p pine-core --all-targets -- -D warnings",
      "cargo test --manifest-path packages/pine-wasm/Cargo.toml -p pine-native --all-targets",
      "cargo clippy --manifest-path packages/pine-wasm/Cargo.toml -p pine-native --all-targets -- -D warnings"
    ]);
    expect(commands.map((command) => command.id)).toEqual([
      "rust-workspace-pine-core-tests-packages-pine-wasm",
      "rust-workspace-pine-core-clippy-packages-pine-wasm",
      "rust-workspace-pine-native-tests-packages-pine-wasm",
      "rust-workspace-pine-native-clippy-packages-pine-wasm"
    ]);
    expect(findAffectedWorkspacePackages(files, signals).map((workspacePackage) => workspacePackage.name)).toEqual(["pine-core", "pine-native"]);
  });

  it("scopes nested non-workspace Rust verification through manifest-path commands", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "packages/native/src/lib.rs", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "rust", manifestPath: "packages/native/Cargo.toml" }]
    );

    expect(commands.map((command) => command.command)).toEqual([
      "cargo test --manifest-path packages/native/Cargo.toml --all-targets",
      "cargo clippy --manifest-path packages/native/Cargo.toml --all-targets -- -D warnings"
    ]);
    expect(commands.map((command) => command.id)).toEqual(["rust-tests-packages-native", "rust-clippy-packages-native"]);
    expect(commands.map((command) => command.packagePath)).toEqual(["packages/native", "packages/native"]);
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

  it("scopes nested Go module verification to the module root", () => {
    const commands = planCommands(
      process.cwd(),
      [{ path: "services/worker/worker.go", status: "modified", additions: 4, deletions: 1, binary: false }],
      [{ ecosystem: "go", manifestPath: "services/worker/go.mod", workspacePackages: [] }]
    );

    expect(commands.map((command) => command.command)).toEqual(["cd services/worker && go test ./...", "cd services/worker && go vet ./..."]);
    expect(commands.map((command) => command.id)).toEqual(["go-tests-services-worker", "go-vet-services-worker"]);
    expect(commands.map((command) => command.packagePath)).toEqual(["services/worker", "services/worker"]);
  });

  it("targets nested Go workspace modules from the workspace root", () => {
    const files: ChangedFile[] = [
      { path: "services/go/modules/core/core.go", status: "modified", additions: 4, deletions: 1, binary: false }
    ];
    const signals: ProjectSignal[] = [
      {
        ecosystem: "go",
        manifestPath: "services/go/go.work",
        workspacePackages: [
          {
            name: "example.com/core",
            path: "services/go/modules/core",
            scripts: {}
          },
          {
            name: "example.com/api",
            path: "services/go/modules/api",
            scripts: {},
            dependencies: ["example.com/core"]
          }
        ]
      }
    ];

    const commands = planCommands(process.cwd(), files, signals);

    expect(commands.map((command) => command.command)).toEqual([
      "cd services/go && go test ./modules/core/...",
      "cd services/go && go vet ./modules/core/...",
      "cd services/go && go test ./modules/api/...",
      "cd services/go && go vet ./modules/api/..."
    ]);
    expect(commands.map((command) => command.id)).toEqual([
      "go-workspace-example-com-core-tests-services-go",
      "go-workspace-example-com-core-vet-services-go",
      "go-workspace-example-com-api-tests-services-go",
      "go-workspace-example-com-api-vet-services-go"
    ]);
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

function xcodeScheme(): string {
  return [
    "<Scheme>",
    "  <BuildAction>",
    "    <BuildActionEntries>",
    "      <BuildActionEntry>",
    "        <BuildableReference BlueprintIdentifier=\"APP_TARGET\" ReferencedContainer=\"container:App.xcodeproj\" />",
    "      </BuildActionEntry>",
    "    </BuildActionEntries>",
    "  </BuildAction>",
    "</Scheme>"
  ].join("\n");
}

function xcodeProject(sdkRoot: string): string {
  return [
    "// !$*UTF8*$!",
    "{",
    "  objects = {",
    "    APP_TARGET /* App */ = {",
    "      isa = PBXNativeTarget;",
    "      buildConfigurationList = APP_CONFIGS /* Build configuration list for PBXNativeTarget App */;",
    "      productType = \"com.apple.product-type.application\";",
    "    };",
    "    APP_CONFIGS /* Build configuration list for PBXNativeTarget App */ = {",
    "      isa = XCConfigurationList;",
    "      buildConfigurations = (",
    "        APP_DEBUG /* Debug */,",
    "      );",
    "    };",
    "    APP_DEBUG /* Debug */ = {",
    "      isa = XCBuildConfiguration;",
    "      buildSettings = {",
    `        SDKROOT = ${sdkRoot};`,
    `        SUPPORTED_PLATFORMS = "${sdkRoot}";`,
    "      };",
    "    };",
    "  };",
    "}"
  ].join("\n");
}
