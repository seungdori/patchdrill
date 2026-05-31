import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CommandPlan, PatchPolicy, PolicyRule, Severity } from "./types.js";

export interface LoadedPolicy {
  path?: string;
  policy: PatchPolicy;
}

const configCandidates = [".patchdrill.yml", ".patchdrill.yaml", ".patchdrill.json"];
const severities: Severity[] = ["info", "low", "medium", "high", "critical"];

export function loadPolicy(root: string, configPath?: string): LoadedPolicy {
  const path = resolvePolicyPath(root, configPath);
  if (!path) return { policy: emptyPolicy() };

  const raw = readFileSync(path, "utf8");
  const parsed = path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  return {
    path,
    policy: normalizePolicy(parsed)
  };
}

export function filterIgnoredFiles<T extends { path: string }>(files: T[], policy: PatchPolicy): T[] {
  if (policy.ignoredPaths.length === 0) return files;
  return files.filter((file) => !matchesAnyPath(file.path, policy.ignoredPaths));
}

export function matchesPolicyRule(path: string, rule: PolicyRule): boolean {
  if (!rule.path) return true;
  const patterns = Array.isArray(rule.path) ? rule.path : [rule.path];
  return matchesAnyPath(path, patterns);
}

export function matchesAnyPath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

export function mergePolicyCommands(existing: CommandPlan[], policy: PatchPolicy): CommandPlan[] {
  const merged = [...existing];
  for (const command of [...policy.requiredCommands, ...policy.optionalCommands]) {
    if (merged.some((item) => item.id === command.id || item.command === command.command)) continue;
    merged.push(command);
  }
  return merged;
}

function resolvePolicyPath(root: string, configPath?: string): string | undefined {
  if (configPath) {
    const resolved = resolve(root, configPath);
    if (!existsSync(resolved)) throw new Error(`PatchDrill config not found: ${resolved}`);
    return resolved;
  }
  for (const candidate of configCandidates) {
    const resolved = resolve(root, candidate);
    if (existsSync(resolved)) return resolved;
  }
  return undefined;
}

function emptyPolicy(): PatchPolicy {
  return {
    ignoredPaths: [],
    rules: [],
    requiredCommands: [],
    optionalCommands: []
  };
}

function normalizePolicy(value: unknown): PatchPolicy {
  if (!isRecord(value)) return emptyPolicy();
  return {
    ignoredPaths: readStringArray(value.ignoredPaths ?? value.ignore),
    ...(readSeverity(value.failOn) ? { failOn: readSeverity(value.failOn) as Severity } : {}),
    ...(readRisk(value.maxRisk) !== undefined ? { maxRisk: readRisk(value.maxRisk) as number } : {}),
    rules: readRules(value.rules),
    requiredCommands: readCommands(value.requiredCommands, true),
    optionalCommands: readCommands(value.optionalCommands, false)
  };
}

function readRules(value: unknown): PolicyRule[] {
  if (!Array.isArray(value)) return [];
  const rules: PolicyRule[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = readString(item.id);
    const title = readString(item.title);
    const severity = readSeverity(item.severity);
    if (!id || !title || !severity) continue;
    rules.push({
      id,
      title,
      severity,
      ...(readPathPattern(item.path ?? item.paths) ? { path: readPathPattern(item.path ?? item.paths) as string | string[] } : {}),
      ...(readString(item.detail) ? { detail: readString(item.detail) as string } : {}),
      ...(readString(item.remediation) ? { remediation: readString(item.remediation) as string } : {}),
      ...(typeof item.weight === "number" ? { weight: item.weight } : {}),
      ...(readStringArray(item.tags).length > 0 ? { tags: readStringArray(item.tags) } : {})
    });
  }
  return rules;
}

function readCommands(value: unknown, required: boolean): CommandPlan[] {
  if (!Array.isArray(value)) return [];
  const commands: CommandPlan[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const command = readString(item.command);
    if (!command) continue;
    const id = readString(item.id) ?? `policy-${slug(command)}`;
    commands.push({
      id,
      label: readString(item.label) ?? id,
      command,
      reason: readString(item.reason) ?? "Configured by PatchDrill policy.",
      ecosystem: "general",
      required
    });
  }
  return commands;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function readPathPattern(value: unknown): string | string[] | undefined {
  const values = readStringArray(value);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

function readSeverity(value: unknown): Severity | undefined {
  return typeof value === "string" && severities.includes(value as Severity) ? (value as Severity) : undefined;
}

function readRisk(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.startsWith("./") ? pattern.slice(2) : pattern;
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];
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
  return new RegExp(`^${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "command";
}
