import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";

interface StackFixture {
  name: string;
  expectedEcosystems: string[];
  expectedAffectedPackages?: string[];
  expectedCommands: string[];
  baseFiles: FixtureFile[];
  changeFiles: FixtureFile[];
}

interface FixtureFile {
  path: string;
  lines: string[];
}

const tempDirs: string[] = [];

describe("stack fixtures", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const fixture of readFixtures()) {
    it(`matches ${fixture.name}`, async () => {
      const root = mkdtempSync(join(tmpdir(), `patchdrill-fixture-${fixture.name}-`));
      tempDirs.push(root);
      git(root, ["init", "-b", "main"]);
      git(root, ["config", "user.email", "test@example.com"]);
      git(root, ["config", "user.name", "PatchDrill Test"]);

      writeFixtureFiles(root, fixture.baseFiles);
      git(root, ["add", "."]);
      git(root, ["commit", "-m", "initial"]);
      writeFixtureFiles(root, fixture.changeFiles);

      const report = await scan({ cwd: root });

      expect(report.projectSignals.map((signal) => signal.ecosystem)).toEqual(expect.arrayContaining(fixture.expectedEcosystems));
      expect(report.commandPlan.map((command) => command.command)).toEqual(fixture.expectedCommands);
      if (fixture.expectedAffectedPackages) {
        expect(report.affectedPackages.map((workspacePackage) => workspacePackage.name)).toEqual(fixture.expectedAffectedPackages);
      }
    });
  }
});

function readFixtures(): StackFixture[] {
  const root = join(process.cwd(), "fixtures", "stacks");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => JSON.parse(readFileSync(join(root, entry.name, "fixture.json"), "utf8")) as StackFixture)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function writeFixtureFiles(root: string, files: FixtureFile[]): void {
  for (const file of files) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${file.lines.join("\n")}\n`, "utf8");
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
