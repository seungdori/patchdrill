import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectSignal } from "./types.js";

export function discoverProjectSignals(root: string): ProjectSignal[] {
  const signals: ProjectSignal[] = [];
  const add = (signal: ProjectSignal) => signals.push(signal);

  if (exists(root, "package.json")) {
    add({
      ecosystem: "node",
      manifestPath: "package.json",
      packageManager: detectNodePackageManager(root),
      scripts: readPackageScripts(root)
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
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
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
