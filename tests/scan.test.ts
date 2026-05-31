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
    writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);

    mkdirSync(join(root, "src", "auth"), { recursive: true });
    writeFileSync(join(root, "src", "auth", "session.ts"), "export const session = 'changed';\n");

    const report = await scan({ cwd: root });

    expect(report.changedFiles.map((file) => file.path)).toContain("src/auth/session.ts");
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
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
