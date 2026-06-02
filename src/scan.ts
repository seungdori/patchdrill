import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { compareBaseline } from "./baseline.js";
import { annotateCodeOwners, loadCodeOwners } from "./codeowners.js";
import { analyzeDependencyChanges } from "./dependency.js";
import { renderEvidenceManifest, type RenderedEvidenceArtifact } from "./evidence.js";
import { gitRoot, readAddedLines, readChangedFiles, readFilePair } from "./git.js";
import { findAffectedWorkspacePackages, planCommands } from "./planner.js";
import { analyzePackageScriptChanges } from "./package-scripts.js";
import { filterIgnoredFiles, loadPolicy, matchesAnyPath, mergePolicyCommands } from "./policy.js";
import { discoverProjectSignals } from "./project.js";
import { renderHtml, renderMarkdown, renderSarif, renderSummaryMarkdown } from "./report.js";
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
  const packageScriptChanges = analyzePackageScriptChanges(gitOptions, changedFiles);
  const workflowFiles = readWorkflowFiles(gitOptions, changedFiles);
  const commandPlan = mergePolicyCommands(planCommands(root, changedFiles, projectSignals, { changedSince: options.base ?? "HEAD" }), loadedPolicy.policy);
  const commandResults = options.run
    ? await runCommandPlan(commandPlan, {
        cwd: root,
        maxOutputChars: options.maxOutputChars ?? 20_000,
        ...(options.runOptional ? { includeOptional: true } : {}),
        ...(options.commandTimeoutMs !== undefined ? { commandTimeoutMs: options.commandTimeoutMs } : {})
      })
    : [];
  const assessment = assessRisk(changedFiles, commandResults, {
    addedLines,
    commandPlan,
    workflowFiles,
    packageScriptChanges,
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
    packageScriptChanges,
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

  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const artifacts: RenderedEvidenceArtifact[] = [];
  if (options.summaryMarkdownPath) artifacts.push({ kind: "summary-markdown", path: options.summaryMarkdownPath, contents: renderSummaryMarkdown(report) });
  if (options.markdownPath) artifacts.push({ kind: "markdown", path: options.markdownPath, contents: renderMarkdown(report) });
  if (options.jsonPath) artifacts.push({ kind: "json", path: options.jsonPath, contents: reportJson });
  if (options.sarifPath) artifacts.push({ kind: "sarif", path: options.sarifPath, contents: renderSarif(report) });
  if (options.htmlPath) artifacts.push({ kind: "html", path: options.htmlPath, contents: renderHtml(report) });
  for (const artifact of artifacts) {
    writeOutput(artifact.path, artifact.contents, root);
  }
  if (options.evidencePath) {
    writeOutput(options.evidencePath, renderEvidenceManifest(report, artifacts, root, reportJson), root);
  }

  return report;
}

function readWorkflowFiles(gitOptions: { cwd: string; base?: string; head?: string }, changedFiles: PatchReport["changedFiles"]): Array<{ file: string; content: string }> {
  const workflowFiles = new Map<string, string>();
  const queue: string[] = [];
  for (const file of changedFiles) {
    if (!file.path.startsWith(".github/workflows/") || file.binary || file.status === "deleted") continue;
    queue.push(file.path);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const path = queue[index];
    if (!path || workflowFiles.has(path)) continue;
    const after = readFilePair(gitOptions, path).after;
    if (after === undefined) continue;
    workflowFiles.set(path, after);
    for (const referencedPath of localReusableWorkflowReferences(after)) {
      if (!workflowFiles.has(referencedPath)) queue.push(referencedPath);
    }
  }

  return [...workflowFiles.entries()].map(([file, content]) => ({ file, content }));
}

function localReusableWorkflowReferences(content: string): string[] {
  const references = new Set<string>();
  for (const match of content.matchAll(/^\s*(?:-\s*)?uses\s*:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/gim)) {
    const path = normalizeLocalReusableWorkflowPath(match[1] ?? "");
    if (path) references.add(path);
  }
  return [...references].sort();
}

function normalizeLocalReusableWorkflowPath(value: string): string | undefined {
  const normalized = value.trim().replaceAll("\\", "/");
  const path = normalized.startsWith("./.github/workflows/")
    ? normalized.slice(2)
    : normalized.startsWith(".github/workflows/")
      ? normalized
      : undefined;
  if (!path) return undefined;
  if (path.includes("..")) return undefined;
  return /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path) ? path : undefined;
}

function writeOutput(path: string, contents: string, root: string): void {
  const resolved = resolve(root, path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, contents, "utf8");
}
