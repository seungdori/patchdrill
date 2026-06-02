import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

export interface MarkdownLinkFailure {
  file: string;
  line: number;
  target: string;
  reason: string;
  resolvedPath?: string;
}

export interface MarkdownLinkSummary {
  fileCount: number;
  linkCount: number;
  failureCount: number;
}

export interface MarkdownLinkCheckResult {
  summary: MarkdownLinkSummary;
  failures: MarkdownLinkFailure[];
}

export function checkMarkdownLinks(root: string, paths = defaultMarkdownLinkPaths(root)): MarkdownLinkCheckResult {
  const failures: MarkdownLinkFailure[] = [];
  let linkCount = 0;

  for (const file of paths) {
    const absoluteFile = resolve(root, file);
    const contents = readFileSync(absoluteFile, "utf8");
    const lines = contents.split(/\r?\n/);
    let inFence = false;
    for (const [index, line] of lines.entries()) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      for (const target of extractMarkdownLinkTargets(line)) {
        const normalized = normalizeMarkdownTarget(target);
        if (!normalized || shouldSkipTarget(normalized)) continue;
        linkCount += 1;
        const failure = checkMarkdownTarget(root, file, absoluteFile, index + 1, normalized);
        if (failure) failures.push(failure);
      }
    }
  }

  return {
    summary: {
      fileCount: paths.length,
      linkCount,
      failureCount: failures.length
    },
    failures
  };
}

export function defaultMarkdownLinkPaths(root: string): string[] {
  const paths = new Set<string>();
  if (existsSync(resolve(root, "README.md"))) paths.add("README.md");
  for (const directory of ["docs", "examples"]) {
    const absoluteDirectory = resolve(root, directory);
    if (!existsSync(absoluteDirectory)) continue;
    for (const path of walkMarkdownFiles(root, absoluteDirectory)) paths.add(path);
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function checkMarkdownTarget(root: string, file: string, absoluteFile: string, line: number, target: string): MarkdownLinkFailure | undefined {
  const [pathPart, anchorPart] = splitAnchor(target);
  const targetPath = pathPart ? decodePathPart(pathPart) : file;
  const absoluteTarget = pathPart ? resolve(dirname(absoluteFile), targetPath) : absoluteFile;
  const relativeTarget = relative(root, absoluteTarget).replaceAll("\\", "/");

  if (relativeTarget.startsWith("../") || relativeTarget === "..") {
    return {
      file,
      line,
      target,
      reason: "Local link points outside the repository.",
      resolvedPath: relativeTarget
    };
  }

  if (!existsSync(absoluteTarget)) {
    return {
      file,
      line,
      target,
      reason: "Local link target does not exist.",
      resolvedPath: relativeTarget
    };
  }

  if (anchorPart) {
    const stat = statSync(absoluteTarget);
    if (stat.isDirectory()) return undefined;
    if (!isMarkdownPath(absoluteTarget)) {
      return {
        file,
        line,
        target,
        reason: "Anchor links can only be verified for Markdown files.",
        resolvedPath: relativeTarget
      };
    }
    const anchors = markdownAnchors(readFileSync(absoluteTarget, "utf8"));
    const anchor = slugAnchor(anchorPart);
    if (!anchors.has(anchor)) {
      return {
        file,
        line,
        target,
        reason: "Markdown anchor was not found in the target file.",
        resolvedPath: relativeTarget
      };
    }
  }

  return undefined;
}

function extractMarkdownLinkTargets(line: string): string[] {
  const targets: string[] = [];
  const pattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    if (match[1]) targets.push(match[1]);
  }
  return targets;
}

function normalizeMarkdownTarget(value: string): string | undefined {
  let target = value.trim();
  if (!target) return undefined;
  const angle = /^<([^>]+)>/.exec(target);
  if (angle?.[1]) target = angle[1].trim();
  target = target.replace(/\s+["'][^"']*["']\s*$/, "").trim();
  return target || undefined;
}

function shouldSkipTarget(target: string): boolean {
  return target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function splitAnchor(target: string): [string, string | undefined] {
  const hashIndex = target.indexOf("#");
  const withoutHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const withoutQuery = withoutHash.split("?", 1)[0] ?? "";
  return [withoutQuery, hashIndex >= 0 ? target.slice(hashIndex + 1) : undefined];
}

function decodePathPart(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function markdownAnchors(contents: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match?.[2]) continue;
    const base = slugAnchor(match[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function slugAnchor(value: string): string {
  return value
    .trim()
    .replace(/`([^`]+)`/g, "$1")
    .toLowerCase()
    .replace(/&amp;/g, "")
    .replace(/[^a-z0-9가-힣 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function walkMarkdownFiles(root: string, directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true, encoding: "utf8" })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(root, absolutePath));
      continue;
    }
    if (entry.isFile() && isMarkdownPath(entry.name)) {
      results.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return results;
}

function isMarkdownPath(path: string): boolean {
  return [".md", ".markdown"].includes(extname(path).toLowerCase());
}
