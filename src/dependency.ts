import { readFilePair, type GitDiffOptions } from "./git.js";
import type { ChangedFile, DependencyChange } from "./types.js";

const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

type DependencyField = (typeof dependencyFields)[number];
type PackageJson = Partial<Record<DependencyField, Record<string, string>>>;

export function analyzeDependencyChanges(options: GitDiffOptions, changedFiles: ChangedFile[]): DependencyChange[] {
  const changes: DependencyChange[] = [];
  for (const file of changedFiles.filter((candidate) => candidate.path.endsWith("package.json"))) {
    const pair = readFilePair(options, file.path);
    const before = parsePackageJson(pair.before);
    const after = parsePackageJson(pair.after);
    if (!before && !after) continue;
    changes.push(...diffPackageJson(file.path, before ?? {}, after ?? {}));
  }
  return changes.sort((a, b) => `${a.file}:${a.dependencyType}:${a.packageName}`.localeCompare(`${b.file}:${b.dependencyType}:${b.packageName}`));
}

function diffPackageJson(file: string, before: PackageJson, after: PackageJson): DependencyChange[] {
  const changes: DependencyChange[] = [];
  for (const dependencyType of dependencyFields) {
    const beforeDeps = before[dependencyType] ?? {};
    const afterDeps = after[dependencyType] ?? {};
    const names = new Set([...Object.keys(beforeDeps), ...Object.keys(afterDeps)]);
    for (const packageName of names) {
      const beforeVersion = beforeDeps[packageName];
      const afterVersion = afterDeps[packageName];
      if (beforeVersion === afterVersion) continue;
      if (beforeVersion === undefined && afterVersion !== undefined) {
        changes.push({ file, packageName, dependencyType, changeType: "added", after: afterVersion });
      } else if (beforeVersion !== undefined && afterVersion === undefined) {
        changes.push({ file, packageName, dependencyType, changeType: "removed", before: beforeVersion });
      } else if (beforeVersion !== undefined && afterVersion !== undefined) {
        changes.push({ file, packageName, dependencyType, changeType: "updated", before: beforeVersion, after: afterVersion });
      }
    }
  }
  return changes;
}

function parsePackageJson(value: string | undefined): PackageJson | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as PackageJson;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
