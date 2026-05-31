import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ProjectSignal, WorkspacePackage } from "./types.js";

export function discoverProjectSignals(root: string): ProjectSignal[] {
  const signals: ProjectSignal[] = [];
  const add = (signal: ProjectSignal) => signals.push(signal);

  if (exists(root, "package.json")) {
    add({
      ecosystem: "node",
      manifestPath: "package.json",
      packageManager: detectNodePackageManager(root),
      scripts: readPackageScripts(root),
      workspacePackages: discoverNodeWorkspacePackages(root)
    });
  }

  if (exists(root, "pyproject.toml")) {
    add({ ecosystem: "python", manifestPath: "pyproject.toml" });
  } else if (exists(root, "requirements.txt") || exists(root, "setup.py") || exists(root, "setup.cfg")) {
    add({
      ecosystem: "python",
      manifestPath: firstExisting(root, ["requirements.txt", "setup.py", "setup.cfg"]) ?? "python"
    });
  }

  if (exists(root, "Cargo.toml")) add({ ecosystem: "rust", manifestPath: "Cargo.toml" });
  if (exists(root, "go.mod")) add({ ecosystem: "go", manifestPath: "go.mod" });
  if (exists(root, "pom.xml") || exists(root, "build.gradle") || exists(root, "build.gradle.kts")) {
    add({
      ecosystem: "java",
      manifestPath: firstExisting(root, ["pom.xml", "build.gradle", "build.gradle.kts"]) ?? "java"
    });
  }
  if (exists(root, "Gemfile")) add({ ecosystem: "ruby", manifestPath: "Gemfile" });
  if (exists(root, "composer.json")) add({ ecosystem: "php", manifestPath: "composer.json" });
  if (exists(root, "global.json") || hasFileWithExtension(root, ".csproj", 2)) {
    add({
      ecosystem: "dotnet",
      manifestPath: firstExisting(root, ["global.json"]) ?? "*.csproj"
    });
  }
  if (exists(root, "Dockerfile") || exists(root, "compose.yaml") || exists(root, "docker-compose.yml")) {
    add({
      ecosystem: "docker",
      manifestPath: firstExisting(root, ["Dockerfile", "compose.yaml", "docker-compose.yml"]) ?? "docker"
    });
  }
  if (hasTerraform(root)) add({ ecosystem: "terraform", manifestPath: "*.tf" });
  if (exists(root, ".github/workflows")) add({ ecosystem: "github-actions", manifestPath: ".github/workflows" });

  return signals;
}

function exists(root: string, relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

function firstExisting(root: string, candidates: string[]): string | undefined {
  return candidates.find((candidate) => exists(root, candidate));
}

function detectNodePackageManager(root: string): string {
  if (exists(root, "pnpm-lock.yaml")) return "pnpm";
  if (exists(root, "yarn.lock")) return "yarn";
  if (exists(root, "bun.lockb") || exists(root, "bun.lock")) return "bun";
  return "npm";
}

function readPackageScripts(root: string): Record<string, string> {
  return readPackageJson(root).scripts ?? {};
}

function readPackageJson(root: string): { name?: string; scripts?: Record<string, string>; workspaces?: unknown } {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
      workspaces?: unknown;
    };
    return parsed;
  } catch {
    return {};
  }
}

function discoverNodeWorkspacePackages(root: string): WorkspacePackage[] {
  const patterns = readWorkspacePatterns(root);
  if (patterns.length === 0) return [];
  const packages = new Map<string, { name: string; path: string; scripts: Record<string, string> }>();

  for (const pattern of patterns) {
    for (const packagePath of expandWorkspacePattern(root, pattern)) {
      const manifest = readPackageJson(join(root, packagePath));
      if (!manifest.name) continue;
      packages.set(packagePath, {
        name: manifest.name,
        path: packagePath,
        scripts: manifest.scripts ?? {}
      });
    }
  }

  return [...packages.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function readWorkspacePatterns(root: string): string[] {
  const packageJson = readPackageJson(root);
  const patterns = new Set<string>();
  const workspaces = packageJson.workspaces;
  if (Array.isArray(workspaces)) {
    for (const pattern of workspaces) if (typeof pattern === "string") patterns.add(pattern);
  } else if (isRecord(workspaces) && Array.isArray(workspaces.packages)) {
    for (const pattern of workspaces.packages) if (typeof pattern === "string") patterns.add(pattern);
  }

  if (exists(root, "pnpm-workspace.yaml")) {
    try {
      const parsed = parseYaml(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")) as { packages?: unknown };
      if (Array.isArray(parsed.packages)) {
        for (const pattern of parsed.packages) if (typeof pattern === "string") patterns.add(pattern);
      }
    } catch {
      // Ignore malformed workspace metadata; normal project detection still works.
    }
  }

  return [...patterns].filter((pattern) => !pattern.startsWith("!"));
}

function expandWorkspacePattern(root: string, pattern: string): string[] {
  const normalized = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized.includes("*")) return exists(root, join(normalized, "package.json")) ? [normalized] : [];
  const prefix = normalized.split("*", 1)[0]?.replace(/\/$/, "") ?? "";
  const base = prefix || ".";
  return walkForPackageJson(join(root, base), root, normalized.includes("**") ? 5 : 1);
}

function walkForPackageJson(directory: string, root: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  try {
    const entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    const results: string[] = [];
    if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) {
      results.push(relativePath(root, directory));
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;
      results.push(...walkForPackageJson(join(directory, entry.name), root, maxDepth, depth + 1));
    }
    return results;
  } catch {
    return [];
  }
}

function shouldSkipDirectory(name: string): boolean {
  return ["node_modules", ".git", "dist", "coverage", ".next", "build"].includes(name);
}

function relativePath(root: string, path: string): string {
  return path.slice(root.length).replace(/^\//, "") || ".";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFileWithExtension(root: string, extension: string, maxDepth: number): boolean {
  return walkForExtension(root, extension, maxDepth, 0);
}

function walkForExtension(directory: string, extension: string, maxDepth: number, depth: number): boolean {
  if (depth > maxDepth) return false;
  try {
    const entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith(extension)) return true;
      if (entry.isDirectory() && walkForExtension(path, extension, maxDepth, depth + 1)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hasTerraform(root: string): boolean {
  return ["main.tf", "variables.tf", "providers.tf", "terraform.tfvars"].some((file) => exists(root, file));
}
