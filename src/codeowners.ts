import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile } from "./types.js";

export interface CodeOwnersRule {
  pattern: string;
  owners: string[];
  line: number;
}

export interface CodeOwnersFile {
  path: string;
  rules: CodeOwnersRule[];
}

const codeOwnersCandidates = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

export function loadCodeOwners(root: string): CodeOwnersFile | undefined {
  for (const candidate of codeOwnersCandidates) {
    const path = join(root, candidate);
    if (!existsSync(path)) continue;
    return {
      path: candidate,
      rules: parseCodeOwners(readFileSync(path, "utf8"))
    };
  }
  return undefined;
}

export function annotateCodeOwners(files: ChangedFile[], codeOwners: CodeOwnersFile | undefined): ChangedFile[] {
  if (!codeOwners) return files;
  return files.map((file) => {
    const owners = ownersForPath(file.path, codeOwners.rules);
    return owners === undefined ? file : { ...file, owners };
  });
}

export function parseCodeOwners(contents: string): CodeOwnersRule[] {
  const rules: CodeOwnersRule[] = [];
  const lines = contents.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const tokens = line.split(/\s+/);
    const pattern = tokens.shift();
    if (!pattern || isUnsupportedPattern(pattern)) continue;
    const owners: string[] = [];
    for (const token of tokens) {
      if (token.startsWith("#")) break;
      owners.push(token);
    }
    rules.push({ pattern, owners, line: index + 1 });
  }
  return rules;
}

export function ownersForPath(path: string, rules: CodeOwnersRule[]): string[] | undefined {
  let owners: string[] | undefined;
  for (const rule of rules) {
    if (codeOwnersPatternToRegExp(rule.pattern).test(path)) {
      owners = rule.owners;
    }
  }
  return owners;
}

function isUnsupportedPattern(pattern: string): boolean {
  return pattern.startsWith("!") || pattern.includes("[") || pattern.includes("]");
}

function codeOwnersPatternToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/^\.\//, "");
  const anchored = normalized.startsWith("/");
  const directoryPattern = normalized.endsWith("/");
  const withoutLeadingSlash = anchored ? normalized.slice(1) : normalized;
  const expanded = directoryPattern ? `${withoutLeadingSlash}**` : withoutLeadingSlash;
  const prefix = anchored || expanded.includes("/") ? "^" : "^(?:.*/)?";
  return new RegExp(`${prefix}${globToRegExpSource(expanded)}$`);
}

function globToRegExpSource(pattern: string): string {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];
    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char ?? "");
    }
  }
  return source;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
