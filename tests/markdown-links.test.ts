import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMarkdownLinks, defaultMarkdownLinkPaths } from "../src/markdown-links.js";

const tempDirs: string[] = [];

describe("markdown link checks", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps public README, docs, and example local links valid", () => {
    const result = checkMarkdownLinks(process.cwd());

    expect(defaultMarkdownLinkPaths(process.cwd()).length).toBeGreaterThan(10);
    expect(result.failures).toEqual([]);
    expect(result.summary.linkCount).toBeGreaterThan(10);
  });

  it("detects missing local files and anchors while skipping external links and fenced examples", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-markdown-links-"));
    tempDirs.push(root);
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "README.md"),
      [
        "# Home",
        "",
        "[valid](docs/guide.md)",
        "[valid anchor](docs/guide.md#install-steps)",
        "[missing](docs/missing.md)",
        "[missing anchor](docs/guide.md#missing-anchor)",
        "[external](https://example.com)",
        "```md",
        "[ignored](docs/also-missing.md)",
        "```",
        ""
      ].join("\n"),
      "utf8"
    );
    writeFileSync(join(root, "docs", "guide.md"), "# Guide\n\n## Install Steps\n", "utf8");

    const result = checkMarkdownLinks(root, ["README.md", "docs/guide.md"]);

    expect(result.failures.map((failure) => `${failure.line}:${failure.target}:${failure.reason}`)).toEqual([
      "5:docs/missing.md:Local link target does not exist.",
      "6:docs/guide.md#missing-anchor:Markdown anchor was not found in the target file."
    ]);
    expect(result.summary).toMatchObject({ fileCount: 2, linkCount: 4, failureCount: 2 });
  });
});
