import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectSignals } from "../src/project.js";

const tempDirs: string[] = [];

describe("discoverProjectSignals", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects Helm charts as Kubernetes projects", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "Chart.yaml"), "apiVersion: v2\nname: api\nversion: 0.1.0\n");
    mkdirSync(join(root, "templates"), { recursive: true });
    writeFileSync(join(root, "templates", "deployment.yaml"), "apiVersion: apps/v1\nkind: Deployment\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "kubernetes",
      manifestPath: "Chart.yaml"
    });
  });

  it("detects conventional Kubernetes manifest directories", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    mkdirSync(join(root, "k8s"), { recursive: true });
    writeFileSync(join(root, "k8s", "deployment.yaml"), "apiVersion: apps/v1\nkind: Deployment\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "kubernetes",
      manifestPath: "k8s"
    });
  });

  it("detects Bazel workspaces", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "MODULE.bazel"), "module(name = \"api\")\n");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "BUILD.bazel"), "java_library(name = \"api\")\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "bazel",
      manifestPath: "MODULE.bazel"
    });
  });

  it("detects Buck target files", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, ".buckconfig"), "[cells]\n  root = .\n");
    writeFileSync(join(root, "BUCK"), "python_library(name = \"api\")\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "buck",
      manifestPath: ".buckconfig"
    });
  });

  it("detects Swift packages", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "Package.swift"), "// swift-tools-version: 5.10\n");

    expect(discoverProjectSignals(root)).toContainEqual({
      ecosystem: "swift",
      manifestPath: "Package.swift"
    });
  });

  it("does not treat Pants BUILD files as Bazel workspaces", () => {
    const root = mkdtempSync(join(tmpdir(), "patchdrill-project-"));
    tempDirs.push(root);
    writeFileSync(join(root, "pants.toml"), "[GLOBAL]\npants_version = \"2.32.0\"\n");
    mkdirSync(join(root, "src", "python", "app"), { recursive: true });
    writeFileSync(join(root, "src", "python", "app", "BUILD"), "python_sources()\n");

    expect(discoverProjectSignals(root).map((signal) => signal.ecosystem)).toEqual(["pants"]);
  });
});
