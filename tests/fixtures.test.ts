import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findAffectedWorkspacePackages, planCommands } from "../src/planner.js";
import { discoverProjectSignals } from "../src/project.js";
import type { ChangedFile } from "../src/types.js";

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
    it(`matches ${fixture.name}`, () => {
      const root = mkdtempSync(join(tmpdir(), `patchdrill-fixture-${fixture.name}-`));
      tempDirs.push(root);

      writeFixtureFiles(root, fixture.baseFiles);
      writeFixtureFiles(root, fixture.changeFiles);

      const changedFiles = fixtureChangedFiles(fixture);
      const projectSignals = discoverProjectSignals(root);
      const commandPlan = planCommands(root, changedFiles, projectSignals);
      const affectedPackages = findAffectedWorkspacePackages(changedFiles, projectSignals);

      expect(projectSignals.map((signal) => signal.ecosystem)).toEqual(expect.arrayContaining(fixture.expectedEcosystems));
      expect(commandPlan.map((command) => command.command)).toEqual(fixture.expectedCommands);
      if (fixture.expectedAffectedPackages) {
        expect(affectedPackages.map((workspacePackage) => workspacePackage.name)).toEqual(fixture.expectedAffectedPackages);
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

function fixtureChangedFiles(fixture: StackFixture): ChangedFile[] {
  return fixture.changeFiles.map((file) => ({
    path: file.path,
    status: "modified",
    additions: file.lines.length,
    deletions: 1,
    binary: false
  }));
}
