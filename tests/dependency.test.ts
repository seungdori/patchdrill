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

  it("reports npm package-lock additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePackageLock(root, {
      lockfileVersion: 3,
      packages: {
        "": {
          dependencies: {
            react: "^18.2.0",
            zod: "^3.0.0"
          }
        },
        "node_modules/react": { version: "18.2.0" },
        "node_modules/zod": { version: "3.0.0" }
      }
    });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePackageLock(root, {
      lockfileVersion: 3,
      packages: {
        "": {
          dependencies: {
            react: "^19.0.0",
            yaml: "^2.0.0"
          }
        },
        "node_modules/react": { version: "19.0.0" },
        "node_modules/yaml": { version: "2.0.0" }
      }
    });

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "package-lock.json", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "package-lock.json",
        packageName: "react",
        packagePath: "node_modules/react",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "18.2.0",
        after: "19.0.0"
      },
      {
        file: "package-lock.json",
        packageName: "yaml",
        packagePath: "node_modules/yaml",
        dependencyType: "lockfile",
        changeType: "added",
        after: "2.0.0"
      },
      {
        file: "package-lock.json",
        packageName: "zod",
        packagePath: "node_modules/zod",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "3.0.0"
      }
    ]);
  });

  it("reports pnpm lockfile additions, removals, and updates", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-pnpm-lock-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);
    writePnpmLock(
      root,
      `
lockfileVersion: '9.0'
packages:
  '@scope/pkg@1.0.0':
    resolution: {integrity: sha512-scope-old}
  react@18.2.0:
    resolution: {integrity: sha512-react-old}
  /zod@3.0.0:
    resolution: {integrity: sha512-zod-old}
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePnpmLock(
      root,
      `
lockfileVersion: '9.0'
packages:
  '@scope/pkg@1.1.0':
    resolution: {integrity: sha512-scope-new}
  react@19.0.0:
    resolution: {integrity: sha512-react-new}
  yaml@2.0.0:
    resolution: {integrity: sha512-yaml-new}
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "pnpm-lock.yaml", status: "modified", additions: 8, deletions: 8, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "pnpm-lock.yaml",
        packageName: "@scope/pkg",
        packagePath: "@scope/pkg@1.0.0 -> @scope/pkg@1.1.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "1.0.0",
        after: "1.1.0"
      },
      {
        file: "pnpm-lock.yaml",
        packageName: "react",
        packagePath: "react@18.2.0 -> react@19.0.0",
        dependencyType: "lockfile",
        changeType: "updated",
        before: "18.2.0",
        after: "19.0.0"
      },
      {
        file: "pnpm-lock.yaml",
        packageName: "yaml",
        packagePath: "yaml@2.0.0",
        dependencyType: "lockfile",
        changeType: "added",
        after: "2.0.0"
      },
      {
        file: "pnpm-lock.yaml",
        packageName: "zod",
        packagePath: "/zod@3.0.0",
        dependencyType: "lockfile",
        changeType: "removed",
        before: "3.0.0"
      }
    ]);
  });
});

function writePackage(root: string, contents: unknown): void {
  writeFileSync(join(root, "package.json"), JSON.stringify(contents, null, 2));
}

function writePackageLock(root: string, contents: unknown): void {
  writeFileSync(join(root, "package-lock.json"), JSON.stringify(contents, null, 2));
}

function writePnpmLock(root: string, contents: string): void {
  writeFileSync(join(root, "pnpm-lock.yaml"), contents.trimStart());
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
