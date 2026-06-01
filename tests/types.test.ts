import { describe, expect, it } from "vitest";
import type { ProjectSignal, ScanOptions } from "../src/types.js";

describe("types", () => {
  it("includes static HTML dashboard output in scan options", () => {
    const options = acceptScanOptions({
      cwd: "/repo",
      htmlPath: "patchdrill-dashboard.html"
    });

    expect(options.htmlPath).toBe("patchdrill-dashboard.html");
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
});

function acceptScanOptions(options: ScanOptions): ScanOptions {
  return options;
}
