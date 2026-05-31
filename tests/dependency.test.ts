import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeDependencyChanges } from "../src/dependency.js";

const tempDirs: string[] = [];

describe("analyzeDependencyChanges", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports package.json dependency additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-deps-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePackage(root, {
      dependencies: {
        react: "^18.2.0",
        zod: "^3.0.0"
      },
      devDependencies: {
        vitest: "^2.0.0"
      }
    });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePackage(root, {
      dependencies: {
        react: "^19.0.0",
        yaml: "^2.0.0"
      },
      devDependencies: {
        vitest: "^2.0.0"
      }
    });

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "package.json", status: "modified", additions: 4, deletions: 3, binary: false }]
    );

    expect(changes).toEqual([
      { file: "package.json", packageName: "react", dependencyType: "dependencies", changeType: "updated", before: "^18.2.0", after: "^19.0.0" },
      { file: "package.json", packageName: "yaml", dependencyType: "dependencies", changeType: "added", after: "^2.0.0" },
      { file: "package.json", packageName: "zod", dependencyType: "dependencies", changeType: "removed", before: "^3.0.0" }
    ]);
  });
});

function writePackage(root: string, contents: unknown): void {
  writeFileSync(join(root, "package.json"), JSON.stringify(contents, null, 2));
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
