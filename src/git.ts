import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile, FileStatus } from "./types.js";

export interface GitDiffOptions {
  cwd: string;
  base?: string;
  head?: string;
}

interface RawDiffEntry {
  path: string;
  previousPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
}

export function isGitRepository(cwd: string): boolean {
  try {
    runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export function gitRoot(cwd: string): string {
  if (!isGitRepository(cwd)) {
    throw new Error(`Not a git repository: ${cwd}`);
  }
  return runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

export function hasHead(cwd: string): boolean {
  try {
    runGit(cwd, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export function readChangedFiles(options: GitDiffOptions): ChangedFile[] {
  const root = gitRoot(options.cwd);
  const entries = new Map<string, RawDiffEntry>();

  if (options.base) {
    const range = `${options.base}...${options.head ?? "HEAD"}`;
    mergeDiff(entries, root, ["diff", "--name-status", "--find-renames", "--no-ext-diff", range], [
      "diff",
      "--numstat",
      "--no-ext-diff",
      range
    ], true);
  } else if (hasHead(root)) {
    mergeDiff(entries, root, ["diff", "--name-status", "--find-renames", "--no-ext-diff"], [
      "diff",
      "--numstat",
      "--no-ext-diff"
    ]);
    mergeDiff(entries, root, ["diff", "--cached", "--name-status", "--find-renames", "--no-ext-diff"], [
      "diff",
      "--cached",
      "--numstat",
      "--no-ext-diff"
    ]);
    mergeUntracked(entries, root);
  } else {
    mergeUntracked(entries, root);
  }

  return [...entries.values()]
    .filter((entry) => entry.path.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function mergeDiff(
  entries: Map<string, RawDiffEntry>,
  cwd: string,
  statusArgs: string[],
  numstatArgs: string[],
  strict = false
): void {
  const statusOutput = strict ? runGit(cwd, statusArgs) : safeGit(cwd, statusArgs);
  const numstatOutput = strict ? runGit(cwd, numstatArgs) : safeGit(cwd, numstatArgs);
  const numstats = parseNumstat(numstatOutput);

  for (const entry of parseNameStatus(statusOutput)) {
    const stat = numstats.get(entry.path);
    const current = entries.get(entry.path);
    entries.set(entry.path, {
      path: entry.path,
      ...(entry.previousPath ?? current?.previousPath
        ? { previousPath: (entry.previousPath ?? current?.previousPath) as string }
        : {}),
      status: entry.status,
      additions: (current?.additions ?? 0) + (stat?.additions ?? 0),
      deletions: (current?.deletions ?? 0) + (stat?.deletions ?? 0),
      binary: Boolean(current?.binary || stat?.binary)
    });
  }
}

function safeGit(cwd: string, args: string[]): string {
  try {
    return runGit(cwd, args);
  } catch {
    return "";
  }
}

function mergeUntracked(entries: Map<string, RawDiffEntry>, cwd: string): void {
  const output = safeGit(cwd, ["ls-files", "--others", "--exclude-standard"]);
  for (const path of output.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (entries.has(path)) continue;
    const fullPath = join(cwd, path);
    const stat = statUntrackedFile(fullPath);
    entries.set(path, {
      path,
      status: existsSync(fullPath) ? "untracked" : "unknown",
      additions: stat.additions,
      deletions: 0,
      binary: stat.binary
    });
  }
}

function statUntrackedFile(path: string): Pick<RawDiffEntry, "additions" | "binary"> {
  try {
    const data = readFileSync(path);
    const sample = data.subarray(0, Math.min(data.length, 8000));
    const binary = sample.includes(0);
    if (binary) return { additions: 0, binary: true };
    const text = data.toString("utf8");
    if (text.length === 0) return { additions: 0, binary: false };
    return { additions: text.split("\n").length - (text.endsWith("\n") ? 1 : 0), binary: false };
  } catch {
    return { additions: 0, binary: false };
  }
}

function parseNameStatus(output: string): Array<Pick<RawDiffEntry, "path" | "previousPath" | "status">> {
  if (!output.trim()) return [];
  return output.split("\n").flatMap((line) => {
    const parts = line.split("\t");
    const marker = parts[0] ?? "";
    const statusCode = marker[0] ?? "";
    if (statusCode === "R") {
      const previousPath = parts[1];
      const path = parts[2];
      return previousPath && path ? [{ path, previousPath, status: "renamed" as const }] : [];
    }
    if (statusCode === "C") {
      const previousPath = parts[1];
      const path = parts[2];
      return previousPath && path ? [{ path, previousPath, status: "copied" as const }] : [];
    }
    const path = parts[1];
    if (!path) return [];
    return [{ path, status: statusFromCode(statusCode) }];
  });
}

function parseNumstat(output: string): Map<string, Pick<RawDiffEntry, "additions" | "deletions" | "binary">> {
  const stats = new Map<string, Pick<RawDiffEntry, "additions" | "deletions" | "binary">>();
  if (!output.trim()) return stats;
  for (const line of output.split("\n")) {
    const parts = line.split("\t");
    const rawAdditions = parts[0] ?? "0";
    const rawDeletions = parts[1] ?? "0";
    const path = parts.at(-1);
    if (!path) continue;
    const binary = rawAdditions === "-" || rawDeletions === "-";
    stats.set(path, {
      additions: binary ? 0 : Number.parseInt(rawAdditions, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(rawDeletions, 10) || 0,
      binary
    });
  }
  return stats;
}

function statusFromCode(code: string): FileStatus {
  switch (code) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "unknown";
  }
}
