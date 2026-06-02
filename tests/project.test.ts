import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectSignals } from "../src/project.js";

const tempDirs: string[] = [];

describe("discoverProjectSignals", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects Helm charts as Kubernetes projects", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "Chart.yaml"), "apiVersion: v2\nname: api\nversion: 0.1.0\n");
    mkdirSync(join(root, "templates"), { recursive: true });
    writeFileSync(join(root, "templates", "deployment.yaml"), "apiVersion: apps/v1\nkind: Deployment\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "kubernetes",
      manifestPath: "Chart.yaml"
    });
  });

  it("detects conventional Kubernetes manifest directories", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    mkdirSync(join(root, "k8s"), { recursive: true });
    writeFileSync(join(root, "k8s", "deployment.yaml"), "apiVersion: apps/v1\nkind: Deployment\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "kubernetes",
      manifestPath: "k8s"
    });
  });

  it("detects Bazel workspaces", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "MODULE.bazel"), "module(name = \"api\")\n");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "BUILD.bazel"), "java_library(name = \"api\")\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "bazel",
      manifestPath: "MODULE.bazel"
    });
  });

  it("detects Buck target files", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, ".buckconfig"), "[cells]\n  root = .\n");
    writeFileSync(join(root, "BUCK"), "python_library(name = \"api\")\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "buck",
      manifestPath: ".buckconfig"
    });
  });

  it("detects Swift packages", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "Package.swift"), "// swift-tools-version: 5.10\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "swift",
      manifestPath: "Package.swift"
    });
  });

  it("detects Xcode projects with shared schemes", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    mkdirSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes"), { recursive: true });
    writeFileSync(join(root, "App.xcodeproj", "project.pbxproj"), "// !$*UTF8*$!\n");
    writeFileSync(join(root, "App.xcodeproj", "xcshareddata", "xcschemes", "App.xcscheme"), "<Scheme></Scheme>\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "xcode",
      manifestPath: "App.xcodeproj"
    });
  });

  it("detects Django projects from manage.py", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "manage.py"), "#!/usr/bin/env python\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "python",
      framework: "django",
      manifestPath: "manage.py"
    });
  });

  it("detects FastAPI dependencies in pyproject metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "pyproject.toml"), "[project]\ndependencies = [\"fastapi>=0.110\", \"uvicorn\"]\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "python",
      framework: "fastapi",
      manifestPath: "pyproject.toml"
    });
  });

  it("detects uv-managed Python projects", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "uv.lock"), "");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "python",
      manifestPath: "uv.lock"
    });
  });

  it("detects nested uv-managed Python projects in monorepos", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true }));
    mkdirSync(join(root, "packages", "pine-engine"), { recursive: true });
    writeFileSync(join(root, "packages", "pine-engine", "pyproject.toml"), "[project]\nname = \"pine-engine\"\ndependencies = [\"pytest\"]\n");
    writeFileSync(join(root, "packages", "pine-engine", "uv.lock"), "");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "python",
      manifestPath: "packages/pine-engine/pyproject.toml"
    });
  });

  it("detects FastAPI app entrypoints", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "requirements.txt"), "fastapi==0.110.0\n");
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "app", "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "python",
      entrypoint: "app.main:app",
      framework: "fastapi",
      manifestPath: "requirements.txt"
    });
  });

  it("detects nested FastAPI app entrypoints relative to the package root", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true }));
    mkdirSync(join(root, "packages", "server", "app"), { recursive: true });
    writeFileSync(join(root, "packages", "server", "pyproject.toml"), "[project]\ndependencies = [\"fastapi>=0.110\"]\n");
    writeFileSync(join(root, "packages", "server", "app", "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "python",
      entrypoint: "app.main:app",
      framework: "fastapi",
      manifestPath: "packages/server/pyproject.toml"
    });
  });

  it("detects nested Cargo workspaces without promoting member manifests to project roots", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    mkdirSync(join(root, "packages", "pine-wasm", "crates", "pine-core"), { recursive: true });
    mkdirSync(join(root, "packages", "pine-wasm", "crates", "pine-native"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true }));
    writeFileSync(join(root, "packages", "pine-wasm", "Cargo.toml"), "[workspace]\nmembers = [\"crates/pine-core\", \"crates/pine-native\"]\n");
    writeFileSync(join(root, "packages", "pine-wasm", "crates", "pine-core", "Cargo.toml"), "[package]\nname = \"pine-core\"\n");
    writeFileSync(
      join(root, "packages", "pine-wasm", "crates", "pine-native", "Cargo.toml"),
      "[package]\nname = \"pine-native\"\n[dependencies]\npine-core = { path = \"../pine-core\" }\n"
    );

    expect(discoverProjectSignals(root).filter((signal) => signal.ecosystem === "rust")).toEqual([
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
            dependencies: ["pine-core"],
            name: "pine-native",
            path: "packages/pine-wasm/crates/pine-native",
            scripts: {}
          }
        ]
      }
    ]);
  });

  it("detects nested Go modules in polyglot monorepos", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true }));
    mkdirSync(join(root, "services", "worker"), { recursive: true });
    writeFileSync(join(root, "services", "worker", "go.mod"), "module example.com/worker\n\ngo 1.22\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "go",
      manifestPath: "services/worker/go.mod",
      workspacePackages: []
    });
  });

  it("does not discover generated PatchDrill artifact directories as nested projects", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true }));
    mkdirSync(join(root, ".patchdrill", "artifact-python"), { recursive: true });
    writeFileSync(join(root, ".patchdrill", "artifact-python", "pyproject.toml"), "[project]\nname = \"artifact\"\n");
    mkdirSync(join(root, ".patchdrill", "artifact-rust"), { recursive: true });
    writeFileSync(join(root, ".patchdrill", "artifact-rust", "Cargo.toml"), "[package]\nname = \"artifact\"\n");
    mkdirSync(join(root, "packages", "server"), { recursive: true });
    writeFileSync(join(root, "packages", "server", "pyproject.toml"), "[project]\nname = \"server\"\n");

    expect(discoverProjectSignals(root).map((signal) => signal.manifestPath)).toEqual(["package.json", "packages/server/pyproject.toml"]);
  });

  it("detects nested Go workspaces without promoting member modules to project roots", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true }));
    mkdirSync(join(root, "services", "go", "modules", "core"), { recursive: true });
    mkdirSync(join(root, "services", "go", "modules", "api"), { recursive: true });
    writeFileSync(join(root, "services", "go", "go.work"), "go 1.22\n\nuse (\n  ./modules/core\n  ./modules/api\n)\n");
    writeFileSync(join(root, "services", "go", "modules", "core", "go.mod"), "module example.com/core\n\ngo 1.22\n");
    writeFileSync(
      join(root, "services", "go", "modules", "api", "go.mod"),
      "module example.com/api\n\ngo 1.22\n\nrequire example.com/core v0.0.0\n\nreplace example.com/core => ../core\n"
    );

    expect(discoverProjectSignals(root).filter((signal) => signal.ecosystem === "go")).toEqual([
      {
        ecosystem: "go",
        manifestPath: "services/go/go.work",
        workspacePackages: [
          {
            dependencies: ["example.com/core"],
            name: "example.com/api",
            path: "services/go/modules/api",
            scripts: {}
          },
          {
            name: "example.com/core",
            path: "services/go/modules/core",
            scripts: {}
          }
        ]
      }
    ]);
  });

  it("ignores FastAPI entrypoints with non-importable module paths", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "requirements.txt"), "fastapi==0.110.0\n");
    mkdirSync(join(root, "src", "service-api"), { recursive: true });
    writeFileSync(join(root, "src", "service-api", "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "python",
      framework: "fastapi",
      manifestPath: "requirements.txt"
    });
  });

  it("detects Spring Boot Gradle projects", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "build.gradle"), "plugins { id 'org.springframework.boot' version '3.3.0' }\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "java",
      framework: "spring-boot",
      manifestPath: "build.gradle"
    });
  });

  it("detects Android Gradle projects separately from Java", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "settings.gradle"), "pluginManagement { repositories { google(); gradlePluginPortal() } }\ninclude ':app'\n");
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "app", "build.gradle"), "plugins { id 'com.android.application' }\n");

    expect(discoverProjectSignals(root)).toEqual([
      {
        ecosystem: "android",
        manifestPath: "app/build.gradle"
      }
    ]);
  });

  it("detects ASP.NET Core project files", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    mkdirSync(join(root, "src", "Api"), { recursive: true });
    writeFileSync(join(root, "src", "Api", "Api.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk.Web\"></Project>\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "dotnet",
      framework: "aspnet-core",
      manifestPath: "src/Api/Api.csproj"
    });
  });

  it("detects Rails projects from Gemfile metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "Gemfile"), "source \"https://rubygems.org\"\ngem \"rails\", \"~> 7.2\"\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "ruby",
      framework: "rails",
      manifestPath: "Gemfile"
    });
  });

  it("detects Laravel projects and Composer scripts", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, "composer.json"),
      JSON.stringify(
        {
          require: { "laravel/framework": "^11.0" },
          scripts: { test: "phpunit" }
        },
        null,
        2
      )
    );

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "php",
      framework: "laravel",
      manifestPath: "composer.json",
      scripts: { test: "phpunit" }
    });
  });

  it("detects .NET solution filter files before full solutions", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "App.sln"), "Microsoft Visual Studio Solution File\n");
    writeFileSync(join(root, "App.slnf"), JSON.stringify({ solution: { path: "App.sln", projects: [] } }, null, 2));

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "dotnet",
      manifestPath: "App.slnf"
    });
  });

  it("does not treat Pants BUILD files as Bazel workspaces", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "pants.toml"), "[GLOBAL]\npants_version = \"2.32.0\"\n");
    mkdirSync(join(root, "src", "python", "app"), { recursive: true });
    writeFileSync(join(root, "src", "python", "app", "BUILD"), "python_sources()\n");

    expect(discoverProjectSignals(root).map((signal) => signal.ecosystem)).toEqual(["pants"]);
  });
});
