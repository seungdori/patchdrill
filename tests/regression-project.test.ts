import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectSignals } from "../src/project.js";
import type { ProjectSignal } from "../src/types.js";

const tempDirs: string[] = [];

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `patchdrill-${prefix}-`));
  tempDirs.push(root);
  return root;
}

function writeJson(root: string, relativePath: string, contents: unknown): void {
  const target = join(root, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, JSON.stringify(contents, null, 2));
}

function writeText(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function nodeSignal(signals: ProjectSignal[]): ProjectSignal {
  const node = signals.find((signal) => signal.ecosystem === "node");
  if (!node) throw new Error("expected a node signal");
  return node;
}

describe("discoverProjectSignals project.ts regressions", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("expands packages/* workspaces to nested package dirs but not the base dir", () => {
    const root = makeRoot("project-workspace-glob");
    writeJson(root, "package.json", { name: "root", workspaces: ["packages/*"] });
    // The base "packages" directory itself carries a manifest with a name, but a
    // single "*" must not match the base path, only the entries beneath it.
    writeJson(root, "packages/package.json", { name: "packages-base" });
    writeJson(root, "packages/foo/package.json", { name: "@scope/foo" });

    const node = nodeSignal(discoverProjectSignals(root));
    const paths = (node.workspacePackages ?? []).map((workspacePackage) => workspacePackage.path);

    expect(paths).toContain("packages/foo");
    expect(paths).not.toContain("packages");
    expect(node.workspacePackages).toEqual([
      { name: "@scope/foo", path: "packages/foo", scripts: {} }
    ]);
  });

  it("expands packages/*/lib workspaces only to the deep lib member", () => {
    const root = makeRoot("project-workspace-deep-glob");
    writeJson(root, "package.json", { name: "root", workspaces: ["packages/*/lib"] });
    writeJson(root, "packages/foo/package.json", { name: "@scope/foo" });
    writeJson(root, "packages/foo/lib/package.json", { name: "@scope/foo-lib" });

    const node = nodeSignal(discoverProjectSignals(root));
    const paths = (node.workspacePackages ?? []).map((workspacePackage) => workspacePackage.path);

    expect(paths).toEqual(["packages/foo/lib"]);
    expect(paths).not.toContain("packages/foo");
  });

  it("picks a stable lexicographically-smallest dotnet manifest across siblings", () => {
    const root = makeRoot("project-dotnet-determinism");
    writeText(
      root,
      "zeta/Zeta.csproj",
      '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n'
    );
    writeText(
      root,
      "alpha/Alpha.csproj",
      '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n'
    );

    const first = discoverProjectSignals(root);
    const dotnet = first.find((signal) => signal.ecosystem === "dotnet");
    if (!dotnet) throw new Error("expected a dotnet signal");

    expect(dotnet.manifestPath).toBe("alpha/Alpha.csproj");

    const second = discoverProjectSignals(root);
    expect(second).toEqual(first);
  });

  it("treats a nested go.work using '.' as a single workspace, not a separate go.mod signal", () => {
    const root = makeRoot("project-go-nested-workspace");
    // Top-level go workspace whose only member is a distinct module so it does
    // not absorb the nested svc workspace.
    writeText(root, "go.work", "go 1.22\n\nuse ./root-mod\n");
    writeText(root, "root-mod/go.mod", "module example.com/root-mod\n\ngo 1.22\n");
    writeText(root, "go.mod", "module example.com/app\n\ngo 1.22\n");
    // Nested workspace: go.work with `use .` puts the module at the workspace root.
    writeText(root, "svc/go.work", "go 1.22\n\nuse .\n");
    writeText(root, "svc/go.mod", "module example.com/svc\n\ngo 1.22\n");

    const signals = discoverProjectSignals(root);
    const goSignals = signals.filter((signal) => signal.ecosystem === "go");
    const svcSignals = goSignals.filter((signal) => signal.manifestPath.startsWith("svc/"));

    expect(svcSignals.map((signal) => signal.manifestPath)).toEqual(["svc/go.work"]);
    expect(goSignals.map((signal) => signal.manifestPath)).not.toContain("svc/go.mod");

    const svcWorkspace = svcSignals[0]!;
    expect(svcWorkspace.workspacePackages).toEqual([
      { name: "example.com/svc", path: "svc", scripts: {} }
    ]);
  });
});
