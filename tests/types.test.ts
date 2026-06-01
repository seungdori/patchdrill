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
});

function acceptScanOptions(options: ScanOptions): ScanOptions {
  return options;
}
