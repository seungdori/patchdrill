import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddedLine, ChangedFile, FileStatus } from "./types.js";

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
      "--find-renames",
      "--no-ext-diff",
      range
    ], true);
  } else if (hasHead(root)) {
    mergeDiff(entries, root, ["diff", "--name-status", "--find-renames", "--no-ext-diff"], [
      "diff",
      "--numstat",
      "--find-renames",
      "--no-ext-diff"
    ]);
    mergeDiff(entries, root, ["diff", "--cached", "--name-status", "--find-renames", "--no-ext-diff"], [
      "diff",
      "--cached",
      "--numstat",
      "--find-renames",
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

export function readAddedLines(options: GitDiffOptions): AddedLine[] {
  const root = gitRoot(options.cwd);
  const lines: AddedLine[] = [];

  if (options.base) {
    const range = `${options.base}...${options.head ?? "HEAD"}`;
    lines.push(...parseAddedLines(runGit(root, ["diff", "--unified=0", "--no-ext-diff", range])));
  } else if (hasHead(root)) {
    lines.push(...parseAddedLines(safeGit(root, ["diff", "--unified=0", "--no-ext-diff"])));
    lines.push(...parseAddedLines(safeGit(root, ["diff", "--cached", "--unified=0", "--no-ext-diff"])));
    lines.push(...readUntrackedAddedLines(root));
  } else {
    lines.push(...readUntrackedAddedLines(root));
  }

  return lines;
}

export function readFilePair(options: GitDiffOptions, path: string): { before?: string; after?: string } {
  const root = gitRoot(options.cwd);
  const before = readBefore(root, options, path);
  const after = readAfter(root, options, path);
  return {
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {})
  };
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
        ? { previousPath: (entry.previousPath ?? current?.previousPath)! }
        : {}),
      status: entry.status,
      additions: (current?.additions ?? 0) + (stat?.additions ?? 0),
      deletions: (current?.deletions ?? 0) + (stat?.deletions ?? 0),
      binary: Boolean(current?.binary) || Boolean(stat?.binary)
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

function readBefore(root: string, options: GitDiffOptions, path: string): string | undefined {
  if (options.base) return safeGitShow(root, `${options.base}:${path}`);
  if (hasHead(root)) return safeGitShow(root, `HEAD:${path}`);
  return undefined;
}

function readAfter(root: string, options: GitDiffOptions, path: string): string | undefined {
  if (options.base) return safeGitShow(root, `${options.head ?? "HEAD"}:${path}`);
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

function safeGitShow(cwd: string, ref: string): string | undefined {
  try {
    return runGit(cwd, ["show", ref]);
  } catch {
    return undefined;
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

function readUntrackedAddedLines(cwd: string): AddedLine[] {
  const output = safeGit(cwd, ["ls-files", "--others", "--exclude-standard"]);
  const lines: AddedLine[] = [];
  for (const path of output.split("\n").map((line) => line.trim()).filter(Boolean)) {
    const fullPath = join(cwd, path);
    if (!existsSync(fullPath)) continue;
    try {
      const data = readFileSync(fullPath);
      const sample = data.subarray(0, Math.min(data.length, 8000));
      if (sample.includes(0)) continue;
      const text = data.toString("utf8");
      const fileLines = text.split("\n");
      fileLines.forEach((content, index) => {
        if (index === fileLines.length - 1 && content === "") return;
        lines.push({ file: path, line: index + 1, content });
      });
    } catch {
      // Ignore unreadable untracked files. The file-level scanner still reports them.
    }
  }
  return lines;
}

function parseAddedLines(diff: string): AddedLine[] {
  const lines: AddedLine[] = [];
  let currentFile: string | undefined;
  let nextLine = 0;

  for (const rawLine of diff.split("\n")) {
    if (rawLine.startsWith("+++ ")) {
      const file = rawLine.slice(4).trim();
      currentFile = file === "/dev/null" ? undefined : stripGitPrefix(file);
      continue;
    }
    if (rawLine.startsWith("@@")) {
      const match = /\+(\d+)(?:,\d+)?/.exec(rawLine);
      nextLine = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      continue;
    }
    if (!currentFile || nextLine <= 0) continue;
    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      lines.push({ file: currentFile, line: nextLine, content: rawLine.slice(1) });
      nextLine += 1;
    } else if (rawLine.startsWith(" ") || rawLine.startsWith("\\")) {
      nextLine += 1;
    }
  }

  return lines;
}

function stripGitPrefix(path: string): string {
  if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
  return path;
}

function parseNameStatus(output: string): Pick<RawDiffEntry, "path" | "previousPath" | "status">[] {
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
    const rawPath = parts.at(-1);
    if (!rawPath) continue;
    const path = resolveNumstatPath(rawPath);
    const binary = rawAdditions === "-" || rawDeletions === "-";
    const stat = {
      additions: binary ? 0 : Number.parseInt(rawAdditions, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(rawDeletions, 10) || 0,
      binary
    };
    // Key on both the raw and rename-resolved path so a genuine rename ("old =>
    // new") matches the post-rename name-status entry, while a real file whose
    // name literally contains " => " or "{ => }" still resolves to its own stats.
    stats.set(rawPath, stat);
    if (path && path !== rawPath) stats.set(path, stat);
  }
  return stats;
}

// `git diff --numstat --find-renames` emits the rename path as `old => new` or
// the brace form `pre/{old => new}/post`; resolve it to the post-rename path so
// the stat keys match the post-rename paths from --name-status.
function resolveNumstatPath(raw: string): string {
  let path = raw;
  if (path.startsWith('"') && path.endsWith('"') && path.length >= 2) {
    path = path.slice(1, -1);
  }
  const brace = /\{(.*?) => (.*?)\}/;
  const braceMatch = brace.exec(path);
  if (braceMatch) {
    return path.replace(brace, braceMatch[2] ?? "").replaceAll("//", "/");
  }
  const arrowIndex = path.indexOf(" => ");
  if (arrowIndex >= 0) {
    return path.slice(arrowIndex + 4);
  }
  return path;
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
