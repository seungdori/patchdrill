import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";

const tempDirs: string[] = [];

describe("scan", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scans a real git diff and infers Node verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(
      join(root, "package.json"),
      JSON.stringify(
        {
          scripts: {
            test: "node --test",
            build: "tsc -p tsconfig.json"
          }
        },
        null,
        2
      )
    );
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, ".github"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
    writeFileSync(join(root, ".github", "CODEOWNERS"), "src/auth/ @security-team\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    mkdirSync(join(root, "src", "auth"), { recursive: true });
    writeFileSync(join(root, "src", "auth", "session.ts"), "export const session = 'changed';\n");

    const report = await scan({ cwd: root });

    expect(report.changedFiles.map((file) => file.path)).toContain("src/auth/session.ts");
    expect(report.changedFiles.find((file) => file.path === "src/auth/session.ts")?.owners).toEqual(["@security-team"]);
    expect(report.codeOwners).toEqual({ path: ".github/CODEOWNERS", ruleCount: 1 });
    expect(report.projectSignals).toContainEqual(expect.objectContaining({ ecosystem: "node" }));
    expect(report.commandPlan.map((command) => command.id)).toContain("node-test");
    expect(report.findings.map((finding) => finding.title)).toContain("High-impact product area changed");
  });

  it("applies policy ignore rules, commands, and policy findings", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }, null, 2));
    writeFileSync(
      join(root, ".patchdrill.yml"),
      `
ignoredPaths:
  - generated/**
requiredCommands:
  - id: contract-tests
    command: node --version
rules:
  - id: schema-review
    title: Schema review required
    severity: high
    path: src/schema/**
`
    );
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    mkdirSync(join(root, "generated"), { recursive: true });
    mkdirSync(join(root, "src", "schema"), { recursive: true });
    writeFileSync(join(root, "generated", "client.ts"), "export const ignored = true;\n");
    writeFileSync(join(root, "src", "schema", "user.ts"), "export const user = true;\n");

    const report = await scan({ cwd: root });

    expect(report.changedFiles.map((file) => file.path)).toEqual(["src/schema/user.ts"]);
    expect(report.commandPlan.map((command) => command.id)).toContain("contract-tests");
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "policy.schema-review",
        file: "src/schema/user.ts"
      })
    );
    expect(report.policy).toMatchObject({
      ruleCount: 1,
      requiredCommandCount: 1
    });
  });

  it("detects Node workspaces and reports affected packages", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(
      join(root, "package.json"),
      JSON.stringify(
        {
          private: true,
          workspaces: ["packages/*"]
        },
        null,
        2
      )
    );
    mkdirSync(join(root, "packages", "api", "src"), { recursive: true });
    mkdirSync(join(root, "packages", "web", "src"), { recursive: true });
    writeFileSync(
      join(root, "packages", "api", "package.json"),
      JSON.stringify({ name: "@acme/api", scripts: { test: "node --test", build: "tsc -p tsconfig.json" } }, null, 2)
    );
    writeFileSync(join(root, "packages", "api", "src", "index.ts"), "export const api = true;\n");
    writeFileSync(
      join(root, "packages", "web", "package.json"),
      JSON.stringify({ name: "@acme/web", scripts: { test: "node --test" }, dependencies: { "@acme/api": "workspace:*" } }, null, 2)
    );
    writeFileSync(join(root, "packages", "web", "src", "index.ts"), "export const web = true;\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeFileSync(join(root, "packages", "api", "src", "index.ts"), "export const api = 'changed';\n");

    const report = await scan({ cwd: root });

    expect(report.projectSignals[0]?.workspacePackages?.map((workspacePackage) => workspacePackage.name)).toEqual(["@acme/api", "@acme/web"]);
    expect(report.affectedPackages.map((workspacePackage) => workspacePackage.name)).toEqual(["@acme/api", "@acme/web"]);
    expect(report.commandPlan.map((command) => command.command)).toEqual([
      "npm --workspace @acme/api run test",
      "npm --workspace @acme/api run build",
      "npm --workspace @acme/web run test"
    ]);
  });

  it("detects Turborepo and emits task-runner commands for workspaces", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(
      join(root, "package.json"),
      JSON.stringify(
        {
          private: true,
          workspaces: ["packages/*"],
          devDependencies: {
            turbo: "^2.0.0"
          }
        },
        null,
        2
      )
    );
    writeFileSync(join(root, "turbo.json"), JSON.stringify({ tasks: { test: {} } }, null, 2));
    mkdirSync(join(root, "packages", "api", "src"), { recursive: true });
    writeFileSync(join(root, "packages", "api", "package.json"), JSON.stringify({ name: "@acme/api", scripts: { test: "node --test" } }, null, 2));
    writeFileSync(join(root, "packages", "api", "src", "index.ts"), "export const api = true;\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeFileSync(join(root, "packages", "api", "src", "index.ts"), "export const api = 'changed';\n");

    const report = await scan({ cwd: root });

    expect(report.projectSignals[0]).toMatchObject({ ecosystem: "node", taskRunner: "turbo" });
    expect(report.commandPlan.map((command) => command.command)).toEqual(["npx turbo run test --filter=@acme/api"]);
  });

  it("detects Cargo workspaces and targets affected crates", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(
      join(root, "Cargo.toml"),
      `
[workspace]
members = ["crates/*"]
`
    );
    mkdirSync(join(root, "crates", "core", "src"), { recursive: true });
    mkdirSync(join(root, "crates", "api", "src"), { recursive: true });
    writeFileSync(
      join(root, "crates", "core", "Cargo.toml"),
      `
[package]
name = "core-lib"
version = "0.1.0"
edition = "2021"
`
    );
    writeFileSync(join(root, "crates", "core", "src", "lib.rs"), "pub fn core() -> bool { true }\n");
    writeFileSync(
      join(root, "crates", "api", "Cargo.toml"),
      `
[package]
name = "api-server"
version = "0.1.0"
edition = "2021"

[dependencies]
core-lib = { path = "../core" }
`
    );
    writeFileSync(join(root, "crates", "api", "src", "lib.rs"), "pub fn api() -> bool { core_lib::core() }\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    writeFileSync(join(root, "crates", "core", "src", "lib.rs"), "pub fn core() -> bool { false }\n");

    const report = await scan({ cwd: root });

    expect(report.projectSignals.find((signal) => signal.ecosystem === "rust")?.workspacePackages?.map((workspacePackage) => workspacePackage.name)).toEqual([
      "api-server",
      "core-lib"
    ]);
    expect(report.affectedPackages.map((workspacePackage) => workspacePackage.name)).toEqual(["core-lib", "api-server"]);
    expect(report.commandPlan.map((command) => command.command)).toEqual([
      "cargo test -p core-lib --all-targets",
      "cargo clippy -p core-lib --all-targets -- -D warnings",
      "cargo test -p api-server --all-targets",
      "cargo clippy -p api-server --all-targets -- -D warnings"
    ]);
  });

  it("includes dependency changes in reports", async () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-"));
    tempDirs.push(root);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "PatchDrill Test"]);

    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { react: "^18.2.0" } }, null, 2));
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { react: "^19.0.0", yaml: "^2.0.0" } }, null, 2));

    const report = await scan({ cwd: root });

    expect(report.dependencyChanges).toContainEqual({
      file: "package.json",
      packageName: "react",
      dependencyType: "dependencies",
      changeType: "updated",
      before: "^18.2.0",
      after: "^19.0.0"
    });
    expect(report.dependencyChanges).toContainEqual({
      file: "package.json",
      packageName: "yaml",
      dependencyType: "dependencies",
      changeType: "added",
      after: "^2.0.0"
    });
  });
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
