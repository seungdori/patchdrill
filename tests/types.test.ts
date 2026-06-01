import { describe, expect, it } from "vitest";
import type { ScanOptions } from "../src/types.js";

describe("types", () => {
  it("includes static HTML dashboard output in scan options", () => {
    const options = acceptScanOptions({
      cwd: "/repo",
      htmlPath: "patchdrill-dashboard.html"
    });

    expect(options.htmlPath).toBe("patchdrill-dashboard.html");
  });
});

function acceptScanOptions(options: ScanOptions): ScanOptions {
  return options;
}
