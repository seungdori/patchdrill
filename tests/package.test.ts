import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package metadata", () => {
  it("keeps the CLI usable from git and npm installs", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(pkg.bin?.patchdrill).toBe("./dist/cli.js");
    expect(pkg.scripts?.prepare).toBe("npm run build");
    expect(pkg.scripts?.prepack).toBe("npm run check");
  });
});
