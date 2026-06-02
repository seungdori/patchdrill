import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { mergeCommandPlanLists } from "./command-plan.js";
import type { CommandPlan, PatchPolicy, PolicyRule, Severity } from "./types.js";

export interface LoadedPolicy {
  path?: string;
  policy: PatchPolicy;
}

const configCandidates = [".patchdrill.yml", ".patchdrill.yaml", ".patchdrill.json"];
const severities: Severity[] = ["info", "low", "medium", "high", "critical"];
const policyKeys = new Set(["$schema", "ignoredPaths", "ignore", "failOn", "maxRisk", "requiredCommands", "optionalCommands", "rules"]);
const commandKeys = new Set(["id", "label", "command", "reason"]);
const ruleKeys = new Set(["id", "title", "severity", "path", "paths", "detail", "remediation", "weight", "tags"]);

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
  return mergeCommandPlanLists(existing, policy.requiredCommands, policy.optionalCommands);
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
  assertKnownKeys("policy", value, policyKeys);
  const failOn = value.failOn === undefined ? undefined : readRequiredSeverity(value.failOn, "failOn");
  const maxRisk = value.maxRisk === undefined ? undefined : readRequiredRisk(value.maxRisk, "maxRisk");
  return {
    ignoredPaths: readStringArray(value.ignoredPaths ?? value.ignore, "ignoredPaths"),
    ...(failOn ? { failOn } : {}),
    ...(maxRisk !== undefined ? { maxRisk } : {}),
    rules: readRules(value.rules),
    requiredCommands: readCommands(value.requiredCommands, true),
    optionalCommands: readCommands(value.optionalCommands, false)
  };
}

function readRules(value: unknown): PolicyRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid PatchDrill policy at rules: expected an array.");
  const rules: PolicyRule[] = [];
  for (const [index, item] of value.entries()) {
    const field = `rules[${index}]`;
    if (!isRecord(item)) throw new Error(`Invalid PatchDrill policy at ${field}: expected an object.`);
    assertKnownKeys(field, item, ruleKeys);
    const id = readRequiredString(item.id, `${field}.id`);
    const title = readRequiredString(item.title, `${field}.title`);
    const severity = readRequiredSeverity(item.severity, `${field}.severity`);
    const path = item.path ?? item.paths;
    const tags = readStringArray(item.tags, `${field}.tags`);
    rules.push({
      id,
      title,
      severity,
      ...(readPathPattern(path, `${field}.path`) ? { path: readPathPattern(path, `${field}.path`) as string | string[] } : {}),
      ...(readString(item.detail) ? { detail: readString(item.detail) as string } : {}),
      ...(readString(item.remediation) ? { remediation: readString(item.remediation) as string } : {}),
      ...(readWeight(item.weight, `${field}.weight`) !== undefined ? { weight: readWeight(item.weight, `${field}.weight`) as number } : {}),
      ...(tags.length > 0 ? { tags } : {})
    });
  }
  return rules;
}

function readCommands(value: unknown, required: boolean): CommandPlan[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid PatchDrill policy at ${required ? "requiredCommands" : "optionalCommands"}: expected an array.`);
  const commands: CommandPlan[] = [];
  for (const [index, item] of value.entries()) {
    const field = `${required ? "requiredCommands" : "optionalCommands"}[${index}]`;
    if (!isRecord(item)) throw new Error(`Invalid PatchDrill policy at ${field}: expected an object.`);
    assertKnownKeys(field, item, commandKeys);
    const command = readRequiredString(item.command, `${field}.command`);
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

function assertKnownKeys(field: string, value: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid PatchDrill policy at ${field}.${key}: unknown field.`);
    }
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRequiredString(value: unknown, field: string): string {
  const parsed = readString(value);
  if (!parsed) throw new Error(`Invalid PatchDrill policy at ${field}: expected a non-empty string.`);
  return parsed;
}

function readStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) throw new Error(`Invalid PatchDrill policy at ${field}: expected a string or string array.`);
  return value.map((item, index) => readRequiredString(item, `${field}[${index}]`));
}

function readPathPattern(value: unknown, field: string): string | string[] | undefined {
  const values = readStringArray(value, field);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

function readRequiredSeverity(value: unknown, field: string): Severity {
  if (typeof value === "string" && severities.includes(value as Severity)) return value as Severity;
  throw new Error(`Invalid PatchDrill policy at ${field}: expected one of ${severities.join(", ")}.`);
}

function readRequiredRisk(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`Invalid PatchDrill policy at ${field}: expected an integer from 0 to 100.`);
  }
  return value;
}

function readWeight(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid PatchDrill policy at ${field}: expected a number.`);
  }
  return value;
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
