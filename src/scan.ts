import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gitRoot, readChangedFiles } from "./git.js";
import { planCommands } from "./planner.js";
import { discoverProjectSignals } from "./project.js";
import { renderMarkdown } from "./report.js";
import { runCommandPlan } from "./runner.js";
import { assessRisk } from "./risk.js";
import type { PatchReport, ScanOptions } from "./types.js";

export async function scan(options: ScanOptions): Promise<PatchReport> {
  const root = gitRoot(options.cwd);
  const changedFiles = readChangedFiles({
    cwd: root,
    ...(options.base ? { base: options.base } : {}),
    ...(options.head ? { head: options.head } : {})
  });
  const projectSignals = discoverProjectSignals(root);
  const commandPlan = planCommands(root, changedFiles, projectSignals);
  const commandResults = options.run
    ? await runCommandPlan(commandPlan, {
        cwd: root,
        maxOutputChars: options.maxOutputChars ?? 20_000
      })
    : [];
  const assessment = assessRisk(changedFiles, commandResults);
  const additions = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const deletions = changedFiles.reduce((sum, file) => sum + file.deletions, 0);
  const failedCommandCount = commandResults.filter((result) => result.exitCode !== 0).length;

  const report: PatchReport = {
    generatedAt: new Date().toISOString(),
    root,
    ...(options.base ? { base: options.base } : {}),
    ...(options.head ? { head: options.head } : {}),
    summary: {
      status: assessment.status,
      riskScore: assessment.riskScore,
      confidenceScore: assessment.confidenceScore,
      changedFileCount: changedFiles.length,
      additions,
      deletions,
      requiredCommandCount: commandPlan.filter((command) => command.required).length,
      failedCommandCount
    },
    changedFiles,
    projectSignals,
    findings: assessment.findings,
    commandPlan,
    commandResults
  };

  if (options.jsonPath) {
    writeOutput(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`, root);
  }
  if (options.markdownPath) {
    writeOutput(options.markdownPath, renderMarkdown(report), root);
  }

  return report;
}

function writeOutput(path: string, contents: string, root: string): void {
  const resolved = resolve(root, path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, contents, "utf8");
}
