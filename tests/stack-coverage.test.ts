import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { supportedDependencyFormats } from "../src/dependency.js";
import { supportedPlannerEcosystems } from "../src/planner.js";
import { renderStackCoverageMarkdown, stackCoverage } from "../src/stack-coverage.js";

describe("stack coverage", () => {
  it("keeps the public coverage matrix synchronized", () => {
    expect(readFileSync("docs/STACK_COVERAGE.md", "utf8")).toBe(renderStackCoverageMarkdown());
  });

  it("covers the planner and dependency registries at a launch-documentation level", () => {
    expect(stackCoverage.length).toBeGreaterThanOrEqual(10);
    expect(supportedPlannerEcosystems()).toEqual([
      "android",
      "bazel",
      "buck",
      "docker",
      "dotnet",
      "go",
      "java",
      "kubernetes",
      "node",
      "pants",
      "php",
      "python",
      "ruby",
      "rust",
      "swift",
      "terraform",
      "xcode"
    ]);
    expect(supportedDependencyFormats()).toContain("package.json");
    expect(supportedDependencyFormats()).toContain("pyproject.toml");
    expect(supportedDependencyFormats()).toContain("NuGet PackageReference/PackageVersion");
    expect(supportedDependencyFormats()).toContain("composer.lock");
  });
});
