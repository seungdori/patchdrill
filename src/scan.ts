import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { annotateCodeOwners, loadCodeOwners } from "./codeowners.js";
import { analyzeDependencyChanges } from "./dependency.js";
import { gitRoot, readAddedLines, readChangedFiles } from "./git.js";
import { findAffectedWorkspacePackages, planCommands } from "./planner.js";
import { filterIgnoredFiles, loadPolicy, matchesAnyPath, mergePolicyCommands } from "./policy.js";
import { discoverProjectSignals } from "./project.js";
import { renderMarkdown, renderSarif } from "./report.js";
import { runCommandPlan } from "./runner.js";
import { assessRisk } from "./risk.js";
import type { PatchReport, ScanOptions } from "./types.js";

export async function scan(options: ScanOptions): Promise<PatchReport> {
  const root = gitRoot(options.cwd);
  const loadedPolicy = loadPolicy(root, options.configPath);
  const gitOptions = {
    cwd: root,
    ...(options.base ? { base: options.base } : {}),
    ...(options.head ? { head: options.head } : {})
  };
  const rawChangedFiles = readChangedFiles(gitOptions);
  const rawAddedLines = readAddedLines(gitOptions);
  const codeOwners = loadCodeOwners(root);
  const changedFiles = annotateCodeOwners(filterIgnoredFiles(rawChangedFiles, loadedPolicy.policy), codeOwners);
  const addedLines = rawAddedLines.filter((line) => !matchesAnyPath(line.file, loadedPolicy.policy.ignoredPaths));
  const projectSignals = discoverProjectSignals(root);
  const affectedPackages = findAffectedWorkspacePackages(changedFiles, projectSignals);
  const dependencyChanges = analyzeDependencyChanges(gitOptions, changedFiles);
  const commandPlan = mergePolicyCommands(planCommands(root, changedFiles, projectSignals), loadedPolicy.policy);
  const commandResults = options.run
    ? await runCommandPlan(commandPlan, {
        cwd: root,
        maxOutputChars: options.maxOutputChars ?? 20_000
      })
    : [];
  const assessment = assessRisk(changedFiles, commandResults, {
    addedLines,
    policy: loadedPolicy.policy
  });
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
    addedLines: addedLines.length,
    projectSignals,
    affectedPackages,
    dependencyChanges,
    ...(loadedPolicy.path
      ? {
          policy: {
            path: relative(root, loadedPolicy.path),
            ignoredPaths: loadedPolicy.policy.ignoredPaths,
            ...(loadedPolicy.policy.failOn ? { failOn: loadedPolicy.policy.failOn } : {}),
            ...(loadedPolicy.policy.maxRisk !== undefined ? { maxRisk: loadedPolicy.policy.maxRisk } : {}),
            ruleCount: loadedPolicy.policy.rules.length,
            requiredCommandCount: loadedPolicy.policy.requiredCommands.length,
            optionalCommandCount: loadedPolicy.policy.optionalCommands.length
          }
        }
      : {}),
    ...(codeOwners
      ? {
          codeOwners: {
            path: codeOwners.path,
            ruleCount: codeOwners.rules.length
          }
        }
      : {}),
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
  if (options.sarifPath) {
    writeOutput(options.sarifPath, renderSarif(report), root);
  }

  return report;
}

function writeOutput(path: string, contents: string, root: string): void {
  const resolved = resolve(root, path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, contents, "utf8");
}
