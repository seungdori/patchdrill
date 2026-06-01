import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzePackageScriptChanges } from "../src/package-scripts.js";

const tempDirs: string[] = [];

describe("analyzePackageScriptChanges", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports package.json script additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-scripts-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePackage(root, {
      scripts: {
        test: "vitest run",
        lint: "eslint .",
        build: "tsc -p tsconfig.json"
      }
    });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePackage(root, {
      scripts: {
        test: "true",
        build: "tsc -p tsconfig.json",
        postinstall: "node scripts/install.js"
      }
    });

    const changes = analyzePackageScriptChanges(
      { cwd: root },
      [{ path: "package.json", status: "modified", additions: 3, deletions: 2, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "package.json",
        scriptName: "lint",
        changeType: "removed",
        before: "eslint ."
      },
      {
        file: "package.json",
        scriptName: "postinstall",
        changeType: "added",
        after: "node scripts/install.js"
      },
      {
        file: "package.json",
        scriptName: "test",
        changeType: "updated",
        before: "vitest run",
        after: "true"
      }
    ]);
  });
});

function writePackage(root: string, value: unknown): void {
  writeFileSync(join(root, "package.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}
