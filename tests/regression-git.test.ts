import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readChangedFiles } from "../src/git.js";

const tempDirs: string[] = [];

describe("readChangedFiles git regression", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports real additions/deletions for renamed files in the base...head range (support-0)", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-git-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "old.txt"), "line1\nline2\nline3\nline4\nline5\n");
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "sub", "old.txt"), "a\nb\nc\nd\ne\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);
    const first = git(root, ["rev-parse", "HEAD"]).trim();

    // Plain top-level rename + modify one line ("old.txt => new.txt").
    git(root, ["mv", "old.txt", "new.txt"]);
    writeFileSync(join(root, "new.txt"), "line1\nCHANGED\nline3\nline4\nline5\n");
    git(root, ["add", "new.txt"]);

    // Subdirectory brace-form rename + modify one line ("sub/{old.txt => renamed.txt}").
    git(root, ["mv", "sub/old.txt", "sub/renamed.txt"]);
    writeFileSync(join(root, "sub", "renamed.txt"), "a\nZZZ\nc\nd\ne\n");
    git(root, ["add", "sub/renamed.txt"]);

    git(root, ["commit", "-m", "rename and modify"]);

    const files = readChangedFiles({ cwd: root, base: first });

    const topLevel = files.find((file) => file.path === "new.txt");
    expect(topLevel).toBeDefined();
    expect(topLevel?.status).toBe("renamed");
    expect(topLevel?.previousPath).toBe("old.txt");
    // The fix: renames now report the real per-line changes, not 0.
    expect((topLevel?.additions ?? 0) + (topLevel?.deletions ?? 0)).toBeGreaterThan(0);
    expect(topLevel?.additions).toBe(1);
    expect(topLevel?.deletions).toBe(1);
    expect(topLevel?.binary).toBe(false);

    const nested = files.find((file) => file.path === "sub/renamed.txt");
    expect(nested).toBeDefined();
    expect(nested?.status).toBe("renamed");
    expect(nested?.previousPath).toBe("sub/old.txt");
    // Brace-form path ("sub/{old.txt => renamed.txt}") resolves so numstat keys
    // align with the post-rename name and the additions/deletions are non-zero.
    expect((nested?.additions ?? 0) + (nested?.deletions ?? 0)).toBeGreaterThan(0);
    expect(nested?.additions).toBe(1);
    expect(nested?.deletions).toBe(1);
    expect(nested?.binary).toBe(false);
  });

  it("reports real additions/deletions for staged renames on the working-tree path (support-0)", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-git-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "old.txt"), "line1\nline2\nline3\nline4\nline5\n");
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "sub", "old.txt"), "a\nb\nc\nd\ne\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    // Stage a top-level rename + modification (no options.base => working-tree path).
    git(root, ["mv", "old.txt", "new.txt"]);
    writeFileSync(join(root, "new.txt"), "line1\nCHANGED\nline3\nline4\nline5\n");
    git(root, ["add", "new.txt"]);

    // Stage a subdirectory (brace-form) rename + modification.
    git(root, ["mv", "sub/old.txt", "sub/renamed.txt"]);
    writeFileSync(join(root, "sub", "renamed.txt"), "a\nZZZ\nc\nd\ne\n");
    git(root, ["add", "sub/renamed.txt"]);

    const files = readChangedFiles({ cwd: root });

    const topLevel = files.find((file) => file.path === "new.txt");
    expect(topLevel).toBeDefined();
    expect(topLevel?.status).toBe("renamed");
    expect(topLevel?.previousPath).toBe("old.txt");
    expect((topLevel?.additions ?? 0) + (topLevel?.deletions ?? 0)).toBeGreaterThan(0);
    expect(topLevel?.additions).toBe(1);
    expect(topLevel?.deletions).toBe(1);

    const nested = files.find((file) => file.path === "sub/renamed.txt");
    expect(nested).toBeDefined();
    expect(nested?.status).toBe("renamed");
    expect(nested?.previousPath).toBe("sub/old.txt");
    expect((nested?.additions ?? 0) + (nested?.deletions ?? 0)).toBeGreaterThan(0);
    expect(nested?.additions).toBe(1);
    expect(nested?.deletions).toBe(1);
  });

  it("flags binary changes and added files in the base...head range (tests-0)", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-git-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "image.bin"), Buffer.from([0x62, 0x69, 0x6e, 0x00, 0x64, 0x61, 0x74, 0x61, 0x0a]));
    writeFileSync(join(root, "keep.txt"), "x\ny\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);
    const first = git(root, ["rev-parse", "HEAD"]).trim();

    // Modify the binary file (still contains a NUL byte).
    writeFileSync(
      join(root, "image.bin"),
      Buffer.from([0x62, 0x69, 0x6e, 0x00, 0x64, 0x61, 0x74, 0x61, 0x0a, 0x6d, 0x6f, 0x72, 0x65, 0x0a])
    );
    // Add a normal text file.
    writeFileSync(join(root, "added.txt"), "added a\nadded b\nadded c\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "binary and added"]);

    const files = readChangedFiles({ cwd: root, base: first });

    const binary = files.find((file) => file.path === "image.bin");
    expect(binary).toBeDefined();
    expect(binary?.status).toBe("modified");
    expect(binary?.binary).toBe(true);
    // numstat emits "-\t-" for binary files, so additions stay 0.
    expect(binary?.additions).toBe(0);
    expect(binary?.deletions).toBe(0);

    const added = files.find((file) => file.path === "added.txt");
    expect(added).toBeDefined();
    expect(added?.status).toBe("added");
    expect(added?.binary).toBe(false);
    expect(added?.additions).toBe(3);
    expect(added?.deletions).toBe(0);
  });

  it("flags binary changes and added files on the working-tree path (tests-0)", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-git-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "image.bin"), Buffer.from([0x62, 0x69, 0x6e, 0x00, 0x64, 0x61, 0x74, 0x61, 0x0a]));
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    // Modify the binary file in the working tree (still has a NUL byte).
    writeFileSync(
      join(root, "image.bin"),
      Buffer.from([0x62, 0x69, 0x6e, 0x00, 0x64, 0x61, 0x74, 0x61, 0x0a, 0x6d, 0x6f, 0x72, 0x65, 0x0a])
    );
    // Stage a normal added text file.
    writeFileSync(join(root, "added.txt"), "added a\nadded b\nadded c\n");
    git(root, ["add", "added.txt"]);

    const files = readChangedFiles({ cwd: root });

    const binary = files.find((file) => file.path === "image.bin");
    expect(binary).toBeDefined();
    expect(binary?.status).toBe("modified");
    expect(binary?.binary).toBe(true);
    expect(binary?.additions).toBe(0);
    expect(binary?.deletions).toBe(0);

    const added = files.find((file) => file.path === "added.txt");
    expect(added).toBeDefined();
    expect(added?.status).toBe("added");
    expect(added?.binary).toBe(false);
    expect(added?.additions).toBe(3);
    expect(added?.deletions).toBe(0);
  });

  it("reports real stats for a file whose name literally contains ' => ' (not a rename)", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-regression-git-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    // A real, unmodified-name file whose path contains a rename-arrow substring.
    const arrowName = "a => b.txt";
    writeFileSync(join(root, arrowName), "one\ntwo\nthree\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);
    const first = git(root, ["rev-parse", "HEAD"]).trim();

    writeFileSync(join(root, arrowName), "one\nCHANGED\nthree\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "modify arrow-named file"]);

    const files = readChangedFiles({ cwd: root, base: first });
    const arrow = files.find((file) => file.path === arrowName);
    expect(arrow).toBeDefined();
    expect(arrow?.status).toBe("modified");
    // resolveNumstatPath must not mangle this non-rename path to "b.txt" and lose its stats.
    expect((arrow?.additions ?? 0) + (arrow?.deletions ?? 0)).toBeGreaterThan(0);
  });
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
