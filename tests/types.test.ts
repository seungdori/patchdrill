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

  it("includes Python framework metadata", () => {
    const signal: ProjectSignal = {
      ecosystem: "python",
      framework: "django",
      manifestPath: "manage.py"
    };

    expect(signal.framework).toBe("django");
  });
});

function acceptScanOptions(options: ScanOptions): ScanOptions {
  return options;
}
