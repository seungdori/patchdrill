import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeDependencyChanges } from "../src/dependency.js";

const tempDirs: string[] = [];

describe("dependency.ts regressions", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dependency-0: ignores Cargo.toml metadata dependency tables but keeps real [dependencies] changes", () => {
    const root = initRepo("patchdrill-regress-cargo-metadata-");
    writeCargoToml(
      root,
      `
[package]
name = "demo"
version = "0.1.0"

[dependencies]
serde = "1.0"

[package.metadata.docs.rs.dependencies]
foodoc = "1.0"

[workspace.metadata.release.dependencies]
barrel = "2.0"
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeCargoToml(
      root,
      `
[package]
name = "demo"
version = "0.1.0"

[dependencies]
serde = "1.1"

[package.metadata.docs.rs.dependencies]
foodoc = "9.9"

[workspace.metadata.release.dependencies]
barrel = "9.9"
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Cargo.toml", status: "modified", additions: 3, deletions: 3, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "Cargo.toml",
        packageName: "serde",
        packagePath: "dependencies",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "1.0",
        after: "1.1"
      }
    ]);
  });

  it("dependency-0: editing ONLY metadata dependency tables produces zero changes", () => {
    const root = initRepo("patchdrill-regress-cargo-metadata-only-");
    writeCargoToml(
      root,
      `
[package]
name = "demo"
version = "0.1.0"

[dependencies]
serde = "1.0"

[package.metadata.docs.rs.dependencies]
foodoc = "1.0"

[workspace.metadata.release.dependencies]
barrel = "2.0"
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeCargoToml(
      root,
      `
[package]
name = "demo"
version = "0.1.0"

[dependencies]
serde = "1.0"

[package.metadata.docs.rs.dependencies]
foodoc = "9.9"

[workspace.metadata.release.dependencies]
barrel = "9.9"
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Cargo.toml", status: "modified", additions: 2, deletions: 2, binary: false }]
    );

    expect(changes).toEqual([]);
  });

  it("dependency-1: only an exact package.json basename is analyzed", () => {
    const root = initRepo("patchdrill-regress-package-basename-");
    writePackageAt(root, "my-package.json", { dependencies: { react: "^18.2.0" } });
    writePackageAt(root, "backend-package.json", { dependencies: { vue: "^3.0.0" } });
    mkdirSync(join(root, "pkgs", "api"), { recursive: true });
    writePackageAt(root, "pkgs/api/package.json", { dependencies: { lodash: "^4.0.0" } });
    writePackageAt(root, "package.json", { dependencies: { express: "^4.0.0" } });
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePackageAt(root, "my-package.json", { dependencies: { react: "^19.0.0" } });
    writePackageAt(root, "backend-package.json", { dependencies: { vue: "^3.5.0" } });
    writePackageAt(root, "pkgs/api/package.json", { dependencies: { lodash: "^4.17.0" } });
    writePackageAt(root, "package.json", { dependencies: { express: "^5.0.0" } });

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [
        { path: "my-package.json", status: "modified", additions: 1, deletions: 1, binary: false },
        { path: "backend-package.json", status: "modified", additions: 1, deletions: 1, binary: false },
        { path: "pkgs/api/package.json", status: "modified", additions: 1, deletions: 1, binary: false },
        { path: "package.json", status: "modified", additions: 1, deletions: 1, binary: false }
      ]
    );

    expect(changes).toEqual([
      {
        file: "package.json",
        packageName: "express",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "^4.0.0",
        after: "^5.0.0"
      },
      {
        file: "pkgs/api/package.json",
        packageName: "lodash",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "^4.0.0",
        after: "^4.17.0"
      }
    ]);

    const namesTouched = changes.map((change) => change.packageName);
    expect(namesTouched).not.toContain("react");
    expect(namesTouched).not.toContain("vue");
  });

  it("dependency-2: Gemfile gem with no version but git/branch surfaces source drift", () => {
    const root = initRepo("patchdrill-regress-gemfile-git-");
    writeGemfile(
      root,
      `
source "https://rubygems.org"

gem "rails", git: "https://github.com/rails/rails", branch: "main"
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeGemfile(
      root,
      `
source "https://rubygems.org"

gem "rails", git: "https://github.com/rails/rails", branch: "stable"
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "Gemfile", status: "modified", additions: 1, deletions: 1, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "Gemfile",
        packageName: "rails",
        packagePath: "gem",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "git:https://github.com/rails/rails, branch:main",
        after: "git:https://github.com/rails/rails, branch:stable"
      }
    ]);
  });

  it("dependency-3: Gradle implementation(enforcedPlatform(...)) is parsed", () => {
    const root = initRepo("patchdrill-regress-gradle-enforced-");
    writeGradleBuild(
      root,
      "build.gradle",
      `
plugins {
  id 'java'
}

dependencies {
  implementation(enforcedPlatform("g:a:1.0"))
}
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeGradleBuild(
      root,
      "build.gradle",
      `
plugins {
  id 'java'
}

dependencies {
  implementation(enforcedPlatform("g:a:2.0"))
}
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "build.gradle", status: "modified", additions: 1, deletions: 1, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "build.gradle",
        packageName: "g:a",
        packagePath: "implementation",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "1.0",
        after: "2.0"
      }
    ]);
  });

  it("dependency-4: deleted [versions] alias keeps the library as updated with an unresolved sentinel", () => {
    const root = initRepo("patchdrill-regress-catalog-dangling-ref-");
    writeGradleVersionCatalog(
      root,
      `
[versions]
guava = "32.1.0-jre"

[libraries]
guava = { module = "com.google.guava:guava", version.ref = "guava" }
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeGradleVersionCatalog(
      root,
      `
[versions]

[libraries]
guava = { module = "com.google.guava:guava", version.ref = "guava" }
`
    );

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [{ path: "gradle/libs.versions.toml", status: "modified", additions: 0, deletions: 1, binary: false }]
    );

    expect(changes).toEqual([
      {
        file: "gradle/libs.versions.toml",
        packageName: "com.google.guava:guava",
        packagePath: "libraries.guava",
        dependencyType: "dependencies",
        changeType: "updated",
        before: "32.1.0-jre",
        after: "version.ref:guava (unresolved)"
      }
    ]);
    expect(changes.map((change) => change.changeType)).not.toContain("removed");
  });

  it("tests-6: malformed/empty manifests parse gracefully to no changes", () => {
    const root = initRepo("patchdrill-regress-malformed-both-");
    writePackageAt(root, "package.json", "{ truncated json missing brace");
    writeCargoToml(root, `[dependencies\nserde = =broken`);
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    // both before and after fail to parse -> graceful empty result, no flood.
    writePackageAt(root, "package.json", "");
    writeCargoToml(root, `}}} not toml at all {{{`);

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [
        { path: "package.json", status: "modified", additions: 1, deletions: 1, binary: false },
        { path: "Cargo.toml", status: "modified", additions: 1, deletions: 1, binary: false }
      ]
    );

    expect(changes).toEqual([]);
  });

  it("tests-6: a valid->garbage transition does not flood with false removals", () => {
    const root = initRepo("patchdrill-regress-valid-to-garbage-");
    writePackageAt(root, "package.json", {
      dependencies: {
        react: "^18.2.0",
        zod: "^3.0.0"
      },
      devDependencies: {
        vitest: "^2.0.0"
      }
    });
    writeCargoToml(
      root,
      `
[dependencies]
serde = "1.0"
tokio = "1.36"
`
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writePackageAt(root, "package.json", "{ \"dependencies\": { \"react\": \"^18");
    writeCargoToml(root, `[dependencies\nserde = =1.0`);

    const changes = analyzeDependencyChanges(
      { cwd: root },
      [
        { path: "package.json", status: "modified", additions: 1, deletions: 4, binary: false },
        { path: "Cargo.toml", status: "modified", additions: 1, deletions: 2, binary: false }
      ]
    );

    // Garbage parses to undefined, so each real prior dependency is reported once
    // as "removed" -- bounded by the actual dependency count, never a flood of
    // synthetic packages.
    expect(changes).toEqual([
      {
        file: "Cargo.toml",
        packageName: "serde",
        packagePath: "dependencies",
        dependencyType: "dependencies",
        changeType: "removed",
        before: "1.0"
      },
      {
        file: "Cargo.toml",
        packageName: "tokio",
        packagePath: "dependencies",
        dependencyType: "dependencies",
        changeType: "removed",
        before: "1.36"
      },
      {
        file: "package.json",
        packageName: "react",
        dependencyType: "dependencies",
        changeType: "removed",
        before: "^18.2.0"
      },
      {
        file: "package.json",
        packageName: "zod",
        dependencyType: "dependencies",
        changeType: "removed",
        before: "^3.0.0"
      },
      {
        file: "package.json",
        packageName: "vitest",
        dependencyType: "devDependencies",
        changeType: "removed",
        before: "^2.0.0"
      }
    ]);
    expect(changes.every((change) => change.changeType === "removed")).toBe(true);
    expect(changes).toHaveLength(5);
  });
});

function initRepo(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "PatchDrill Test"]);
  return root;
}

function writePackageAt(root: string, relativePath: string, contents: unknown): void {
  const body = typeof contents === "string" ? contents : JSON.stringify(contents, null, 2);
  writeFileSync(join(root, relativePath), body);
}

function writeCargoToml(root: string, contents: string): void {
  writeFileSync(join(root, "Cargo.toml"), contents.trimStart());
}

function writeGemfile(root: string, contents: string): void {
  writeFileSync(join(root, "Gemfile"), contents.trimStart());
}

function writeGradleBuild(root: string, fileName: "build.gradle" | "build.gradle.kts", contents: string): void {
  writeFileSync(join(root, fileName), contents.trimStart());
}

function writeGradleVersionCatalog(root: string, contents: string): void {
  mkdirSync(join(root, "gradle"), { recursive: true });
  writeFileSync(join(root, "gradle", "libs.versions.toml"), contents.trimStart());
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
