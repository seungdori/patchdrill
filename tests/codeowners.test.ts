import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { annotateCodeOwners, loadCodeOwners, ownersForPath, parseCodeOwners } from "../src/codeowners.js";
import type { ChangedFile } from "../src/types.js";

const tempDirs: string[] = [];

describe("codeowners", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the last matching CODEOWNERS rule", () => {
    const rules = parseCodeOwners(`
* @global
*.ts @typescript # inline comment
/src/ @source
/src/generated/
docs/* docs@example.com
`);

    expect(ownersForPath("src/index.ts", rules)).toEqual(["@source"]);
    expect(ownersForPath("src/generated/client.ts", rules)).toEqual([]);
    expect(ownersForPath("docs/guide.md", rules)).toEqual(["docs@example.com"]);
    expect(ownersForPath("docs/nested/guide.md", rules)).toEqual(["@global"]);
  });

  it("loads CODEOWNERS from GitHub's search order", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-codeowners-"));
    tempDirs.push(root);
    mkdirSync(join(root, ".github"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, ".github", "CODEOWNERS"), "*.ts @github-dir\n");
    writeFileSync(join(root, "CODEOWNERS"), "*.ts @root\n");
    writeFileSync(join(root, "docs", "CODEOWNERS"), "*.ts @docs\n");

    const loaded = loadCodeOwners(root);

    expect(loaded?.path).toBe(".github/CODEOWNERS");
    expect(ownersForPath("src/index.ts", loaded?.rules ?? [])).toEqual(["@github-dir"]);
  });

  it("annotates changed files with owners", () => {
    const codeOwners = {
      path: "CODEOWNERS",
      rules: parseCodeOwners("*.md @docs\nsrc/ @source\n")
    };
    const files: ChangedFile[] = [
      { path: "README.md", status: "modified", additions: 1, deletions: 0, binary: false },
      { path: "src/index.ts", status: "modified", additions: 2, deletions: 1, binary: false }
    ];

    expect(annotateCodeOwners(files, codeOwners)).toEqual([
      { path: "README.md", status: "modified", additions: 1, deletions: 0, binary: false, owners: ["@docs"] },
      { path: "src/index.ts", status: "modified", additions: 2, deletions: 1, binary: false, owners: ["@source"] }
    ]);
  });
});
