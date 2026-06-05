import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("package metadata", () => {
  it("keeps the CLI usable from git and npm installs", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
      files?: string[];
      keywords?: string[];
      dependencies?: Record<string, string>;
    };

    expect(pkg.bin?.patchdrill).toBe("./dist/cli.js");
    expect(pkg.scripts?.["test:fast"]).toContain("--exclude tests/scan.test.ts");
    expect(pkg.scripts?.["test:integration"]).toContain("tests/scan.test.ts");
    expect(pkg.scripts?.prepare).toBe("npm run build");
    expect(pkg.scripts?.prepack).toBe("npm run check");
    expect(pkg.files).toEqual(
      expect.arrayContaining(["dist", "schemas", "docs", "examples", "fixtures", ".patchdrill.yml", "README.md", "LICENSE", "action.yml", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md"])
    );
    expect(pkg.keywords).toEqual(expect.arrayContaining(["ai-coding", "code-review", "sarif", "github-actions", "supply-chain", "mcp", "model-context-protocol"]));
    expect(pkg.dependencies).toMatchObject({
      "@modelcontextprotocol/sdk": expect.any(String),
      zod: expect.any(String)
    });
    for (const schema of [
      "schemas/patchdrill-policy.schema.json",
      "schemas/patchdrill-report.schema.json",
      "schemas/patchdrill-evidence.schema.json",
      "schemas/patchdrill-doctor.schema.json",
      "schemas/patchdrill-release-check.schema.json"
    ]) {
      expect(existsSync(schema)).toBe(true);
    }
  });

  it("keeps default generated report artifacts out of git", () => {
    const gitignore = readFileSync(".gitignore", "utf8");

    for (const path of [
      ".patchdrill/",
      "patchdrill-evidence.json",
      "patchdrill-summary.md",
      "patchdrill-report.md",
      "patchdrill-report.json",
      "patchdrill.sarif",
      "patchdrill-dashboard.html"
    ]) {
      expect(gitignore).toContain(path);
    }
  });
});
