import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createPatchDrillMcpServer, PATCHDRILL_MCP_PROMPTS, PATCHDRILL_MCP_RESOURCE_URIS, PATCHDRILL_MCP_TOOLS } from "../src/mcp.js";

const tempDirs: string[] = [];

describe("PatchDrill MCP server", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exposes tools, resources, prompts, and a read-only scan over MCP", async () => {
    const root = createRepo("patchdrill-mcp-");
    const canonicalRoot = realpathSync(root);
    writeFileSync(join(root, "src", "index.ts"), "export const changed = true;\n");
    const { client, close } = await connectClient(root);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([...PATCHDRILL_MCP_TOOLS]));
      expect(tools.tools.find((tool) => tool.name === "patchdrill_scan")?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      });
      expect(tools.tools.find((tool) => tool.name === "patchdrill_run_verification")?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true
      });

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toEqual(expect.arrayContaining([...PATCHDRILL_MCP_RESOURCE_URIS]));
      const manifest = await client.readResource({ uri: "patchdrill://manifest" });
      const manifestContent = manifest.contents[0];
      expect(manifestContent && "text" in manifestContent ? manifestContent.text : "").toContain("patchdrill_run_verification");

      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(expect.arrayContaining([...PATCHDRILL_MCP_PROMPTS]));
      const prompt = await client.getPrompt({ name: "patchdrill_draft_pr_comment", arguments: { audience: "maintainer" } });
      expect(prompt.messages[0]?.content.type).toBe("text");
      expect(prompt.messages[0]?.content.type === "text" ? prompt.messages[0].content.text : "").toContain("PatchDrill as the source of truth");

      const result = await client.callTool({ name: "patchdrill_scan", arguments: { cwd: root } });
      const scanContent = structuredContent(result);
      expect(result.isError).not.toBe(true);
      expect(scanContent).toMatchObject({
        ok: true,
        root: canonicalRoot,
        summary: {
          changedFileCount: 1
        },
        gate: {
          failOn: "critical"
        }
      });
      expect(scanContent.report).toMatchObject({
        root: canonicalRoot,
        changedFiles: [expect.objectContaining({ path: "src/index.ts" })]
      });
      expect(existsSync(join(root, ".patchdrill", "mcp"))).toBe(false);
    } finally {
      await close();
    }
  });

  it("separates proof-pack writes from command execution and verifies generated evidence", async () => {
    const root = createRepo("patchdrill-mcp-proof-");
    writeFileSync(join(root, "README.md"), "# Changed\n");
    const { client, close } = await connectClient(root);
    try {
      const refused = await client.callTool({ name: "patchdrill_run_verification", arguments: { cwd: root, outputDirectory: ".patchdrill/mcp/run" } });
      expect(refused.isError).toBe(true);
      expect(textContent(refused)).toContain("allowCommandExecution: true");

      const proofPack = await client.callTool({
        name: "patchdrill_proof_pack",
        arguments: { cwd: root, outputDirectory: ".patchdrill/mcp/proof", prefix: "agent-review" }
      });
      expect(proofPack.isError).not.toBe(true);
      expect(structuredContent(proofPack)).toMatchObject({
        ok: true,
        artifactPaths: {
          json: ".patchdrill/mcp/proof/agent-review-report.json",
          evidence: ".patchdrill/mcp/proof/agent-review-evidence.json"
        },
        evidenceVerification: {
          ok: true
        }
      });
      expect(existsSync(join(root, ".patchdrill", "mcp", "proof", "agent-review-report.json"))).toBe(true);

      const verified = await client.callTool({
        name: "patchdrill_verify_evidence",
        arguments: { cwd: root, evidencePath: ".patchdrill/mcp/proof/agent-review-evidence.json" }
      });
      expect(structuredContent(verified)).toMatchObject({
        ok: true,
        verification: {
          ok: true,
          checkedReportContract: true
        }
      });
    } finally {
      await close();
    }
  });

  it("rejects MCP path inputs that escape the server workspace", async () => {
    const root = createRepo("patchdrill-mcp-paths-");
    const { client, close } = await connectClient(root);
    try {
      const outsideCwd = await client.callTool({ name: "patchdrill_scan", arguments: { cwd: ".." } });
      expect(outsideCwd.isError).toBe(true);
      expect(textContent(outsideCwd)).toContain("MCP cwd must stay inside");

      const outsideConfig = await client.callTool({ name: "patchdrill_scan", arguments: { cwd: root, configPath: "../outside.yml" } });
      expect(outsideConfig.isError).toBe(true);
      expect(textContent(outsideConfig)).toContain("configPath must not contain .. path segments");

      const absoluteBaseline = await client.callTool({ name: "patchdrill_scan", arguments: { cwd: root, baselinePath: "/tmp/patchdrill-baseline.json" } });
      expect(absoluteBaseline.isError).toBe(true);
      expect(textContent(absoluteBaseline)).toContain("baselinePath must be relative to the repository root");

      const outsideOutput = await client.callTool({
        name: "patchdrill_proof_pack",
        arguments: { cwd: root, outputDirectory: "../outside", prefix: "escaped" }
      });
      expect(outsideOutput.isError).toBe(true);
      expect(textContent(outsideOutput)).toContain("outputDirectory must not contain .. path segments");
      expect(existsSync(join(root, "outside", "escaped-report.json"))).toBe(false);
    } finally {
      await close();
    }
  });

  it("executes repository commands only after explicit MCP confirmation", async () => {
    const root = createRepo("patchdrill-mcp-run-");
    writeFileSync(
      join(root, ".patchdrill.yml"),
      `
requiredCommands:
  - id: mcp-required
    command: node -e "console.log('mcp-required-ok')"
`
    );
    git(root, ["add", ".patchdrill.yml"]);
    git(root, ["commit", "-m", "policy"]);
    writeFileSync(join(root, "README.md"), "# Changed\n");
    const { client, close } = await connectClient(root);
    try {
      const result = await client.callTool({
        name: "patchdrill_run_verification",
        arguments: {
          cwd: root,
          allowCommandExecution: true,
          outputDirectory: ".patchdrill/mcp/run",
          prefix: "verified"
        }
      });
      expect(result.isError).not.toBe(true);
      expect(structuredContent(result)).toMatchObject({
        ok: true,
        evidenceVerification: {
          ok: true
        }
      });
      const report = JSON.parse(readFileSync(join(root, ".patchdrill", "mcp", "run", "verified-report.json"), "utf8")) as {
        commandResults?: { id?: string; stdout?: string }[];
      };
      expect(report.commandResults).toContainEqual(expect.objectContaining({ id: "mcp-required", stdout: expect.stringContaining("mcp-required-ok") }));
    } finally {
      await close();
    }
  });
});

async function connectClient(root: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createPatchDrillMcpServer({ workspaceRoot: root, version: "0.0.0-test" });
  const client = new Client({ name: "patchdrill-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    }
  };
}

function createRepo(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "PatchDrill Test"]);
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }, null, 2));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial"]);
  return root;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}

function structuredContent(result: unknown): Record<string, unknown> {
  if (!isRecord(result) || !isRecord(result.structuredContent)) {
    throw new Error("Expected MCP tool result with structuredContent.");
  }
  return result.structuredContent;
}

function textContent(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) return "";
  return result.content
    .map((entry) => (isRecord(entry) && entry.type === "text" && typeof entry.text === "string" ? entry.text : ""))
    .filter((entry) => entry.length > 0)
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
