import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { compareBaseline } from "./baseline.js";
import { annotateCodeOwners, loadCodeOwners } from "./codeowners.js";
import { analyzeDependencyChanges } from "./dependency.js";
import { gitRoot, readAddedLines, readChangedFiles, readFilePair } from "./git.js";
import { findAffectedWorkspacePackages, planCommands } from "./planner.js";
import { filterIgnoredFiles, loadPolicy, matchesAnyPath, mergePolicyCommands } from "./policy.js";
import { discoverProjectSignals } from "./project.js";
import { renderHtml, renderMarkdown, renderSarif } from "./report.js";
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
  const workflowFiles = readWorkflowFiles(gitOptions, changedFiles);
  const commandPlan = mergePolicyCommands(planCommands(root, changedFiles, projectSignals, { changedSince: options.base ?? "HEAD" }), loadedPolicy.policy);
  const commandResults = options.run
    ? await runCommandPlan(commandPlan, {
        cwd: root,
        maxOutputChars: options.maxOutputChars ?? 20_000,
        ...(options.commandTimeoutMs !== undefined ? { commandTimeoutMs: options.commandTimeoutMs } : {})
      })
    : [];
  const assessment = assessRisk(changedFiles, commandResults, {
    addedLines,
    workflowFiles,
    policy: loadedPolicy.policy
  });
  const additions = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const deletions = changedFiles.reduce((sum, file) => sum + file.deletions, 0);
  const failedCommandCount = commandResults.filter((result) => result.exitCode !== 0).length;
  const baseline = options.baselinePath
    ? compareBaseline(root, options.baselinePath, {
        summary: {
          status: assessment.status,
          riskScore: assessment.riskScore
        },
        findings: assessment.findings
      })
    : undefined;

  const report: PatchReport = {
    schemaVersion: "1",
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
    ...(baseline ? { baseline } : {}),
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
  if (options.htmlPath) {
    writeOutput(options.htmlPath, renderHtml(report), root);
  }

  return report;
}

function readWorkflowFiles(gitOptions: { cwd: string; base?: string; head?: string }, changedFiles: PatchReport["changedFiles"]): Array<{ file: string; content: string }> {
  const workflowFiles: Array<{ file: string; content: string }> = [];
  for (const file of changedFiles) {
    if (!file.path.startsWith(".github/workflows/") || file.binary || file.status === "deleted") continue;
    const after = readFilePair(gitOptions, file.path).after;
    if (after !== undefined) workflowFiles.push({ file: file.path, content: after });
  }
  return workflowFiles;
}

function writeOutput(path: string, contents: string, root: string): void {
  const resolved = resolve(root, path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, contents, "utf8");
}
