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
});
