import { readFilePair, type GitDiffOptions } from "./git.js";
import type { ChangedFile, PackageScriptChange } from "./types.js";

type PackageScripts = Record<string, string>;

export function analyzePackageScriptChanges(options: GitDiffOptions, changedFiles: ChangedFile[]): PackageScriptChange[] {
  const changes: PackageScriptChange[] = [];
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("package.json"))) {
    const pair = readFilePair(options, file.path);
    const before = parsePackageScripts(pair.before);
    const after = parsePackageScripts(pair.after);
    if (!before && !after) continue;
    changes.push(...diffPackageScripts(file.path, before ?? {}, after ?? {}));
  }

  return changes.sort((a, b) => `${a.file}:${a.scriptName}`.localeCompare(`${b.file}:${b.scriptName}`));
}

function diffPackageScripts(file: string, before: PackageScripts, after: PackageScripts): PackageScriptChange[] {
  const changes: PackageScriptChange[] = [];
  const scriptNames = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const scriptName of scriptNames) {
    const beforeScript = before[scriptName];
    const afterScript = after[scriptName];
    if (beforeScript === afterScript) continue;
    if (beforeScript === undefined && afterScript !== undefined) {
      changes.push({ file, scriptName, changeType: "added", after: afterScript });
    } else if (beforeScript !== undefined && afterScript === undefined) {
      changes.push({ file, scriptName, changeType: "removed", before: beforeScript });
    } else if (beforeScript !== undefined && afterScript !== undefined) {
      changes.push({ file, scriptName, changeType: "updated", before: beforeScript, after: afterScript });
    }
  }
  return changes;
}

function parsePackageScripts(value: string | undefined): PackageScripts | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return undefined;
    const scriptsValue = (parsed as { scripts?: unknown }).scripts;
    if (!scriptsValue || typeof scriptsValue !== "object") return undefined;
    const scripts: PackageScripts = {};
    for (const [scriptName, command] of Object.entries(scriptsValue)) {
      if (typeof command === "string") scripts[scriptName] = command;
    }
    return scripts;
  } catch {
    return undefined;
  }
}
