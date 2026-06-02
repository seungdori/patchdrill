import { describe, expect, it } from "vitest";
import type { PackageScriptChange, PatchReport, ProjectSignal, ScanOptions } from "../src/types.js";
import { withVerification } from "../src/verification.js";

describe("types", () => {
  it("includes static HTML dashboard output in scan options", () => {
    const options = acceptScanOptions({
      cwd: "/repo",
      run: true,
      runOptional: true,
      evidencePath: "patchdrill-evidence.json",
      summaryMarkdownPath: "patchdrill-summary.md",
      htmlPath: "patchdrill-dashboard.html"
    });

    expect(options.evidencePath).toBe("patchdrill-evidence.json");
    expect(options.htmlPath).toBe("patchdrill-dashboard.html");
    expect(options.summaryMarkdownPath).toBe("patchdrill-summary.md");
    expect(options.runOptional).toBe(true);
  });

  it("includes Kubernetes as a supported project ecosystem", () => {
    const signal: ProjectSignal = {
      ecosystem: "kubernetes",
      manifestPath: "k8s"
    };

    expect(signal.ecosystem).toBe("kubernetes");
  });

  it("includes Bazel and Buck as supported project ecosystems", () => {
    const bazel: ProjectSignal = {
      ecosystem: "bazel",
      manifestPath: "MODULE.bazel"
    };
    const buck: ProjectSignal = {
      ecosystem: "buck",
      manifestPath: ".buckconfig"
    };

    expect([bazel.ecosystem, buck.ecosystem]).toEqual(["bazel", "buck"]);
  });

  it("includes Swift as a supported project ecosystem", () => {
    const signal: ProjectSignal = {
      ecosystem: "swift",
      manifestPath: "Package.swift"
    };

    expect(signal.ecosystem).toBe("swift");
  });

  it("includes Xcode as a supported project ecosystem", () => {
    const signal: ProjectSignal = {
      ecosystem: "xcode",
      manifestPath: "App.xcodeproj"
    };

    expect(signal.ecosystem).toBe("xcode");
  });

  it("includes Python framework and entrypoint metadata", () => {
    const signal: ProjectSignal = {
      ecosystem: "python",
      entrypoint: "app.main:app",
      framework: "fastapi",
      manifestPath: "requirements.txt"
    };

    expect([signal.framework, signal.entrypoint]).toEqual(["fastapi", "app.main:app"]);
  });

  it("includes Spring Boot framework metadata", () => {
    const signal: ProjectSignal = {
      ecosystem: "java",
      framework: "spring-boot",
      manifestPath: "build.gradle"
    };

    expect(signal.framework).toBe("spring-boot");
  });

  it("includes Rails and Laravel framework metadata", () => {
    const rails: ProjectSignal = {
      ecosystem: "ruby",
      framework: "rails",
      manifestPath: "Gemfile"
    };
    const laravel: ProjectSignal = {
      ecosystem: "php",
      framework: "laravel",
      manifestPath: "composer.json",
      scripts: { test: "phpunit" }
    };

    expect([rails.framework, laravel.framework, laravel.scripts?.test]).toEqual(["rails", "laravel", "phpunit"]);
  });

  it("includes Android as a supported project ecosystem", () => {
    const signal: ProjectSignal = {
      ecosystem: "android",
      manifestPath: "app/build.gradle"
    };

    expect(signal.ecosystem).toBe("android");
  });

  it("includes ASP.NET Core framework metadata", () => {
    const signal: ProjectSignal = {
      ecosystem: "dotnet",
      framework: "aspnet-core",
      manifestPath: "src/Api/Api.csproj"
    };

    expect(signal.framework).toBe("aspnet-core");
  });

  it("includes package script change metadata", () => {
    const change: PackageScriptChange = {
      file: "package.json",
      scriptName: "postinstall",
      changeType: "added",
      after: "node scripts/install.js"
    };

    expect(change).toEqual({
      file: "package.json",
      scriptName: "postinstall",
      changeType: "added",
      after: "node scripts/install.js"
    });
  });

  it("includes package script changes in patch reports", () => {
    const report = acceptPatchReport(withVerification({
      schemaVersion: "1",
      generatedAt: "2026-06-01T00:00:00.000Z",
      root: "/repo",
      summary: {
        status: "warn",
        riskScore: 25,
        confidenceScore: 75,
        changedFileCount: 1,
        additions: 2,
        deletions: 1,
        requiredCommandCount: 0,
        failedCommandCount: 0
      },
      changedFiles: [{ path: "package.json", status: "modified", additions: 2, deletions: 1, binary: false }],
      addedLines: 2,
      projectSignals: [{ ecosystem: "node", manifestPath: "package.json" }],
      affectedPackages: [],
      dependencyChanges: [],
      packageScriptChanges: [
        {
          file: "package.json",
          scriptName: "test",
          changeType: "updated",
          before: "vitest run",
          after: "true"
        }
      ],
      findings: [],
      commandPlan: [],
      commandResults: []
    }));

    expect(report.packageScriptChanges[0]?.scriptName).toBe("test");
  });
});

function acceptScanOptions(options: ScanOptions): ScanOptions {
  return options;
}

function acceptPatchReport(report: PatchReport): PatchReport {
  return report;
}
