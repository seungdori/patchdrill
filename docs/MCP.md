# MCP Server

PatchDrill ships a local Model Context Protocol server for AI coding tools that need deterministic patch evidence instead of another free-form review opinion.

The MCP surface keeps the product boundary intact:

- `scan` remains deterministic, local, and read-only by default.
- No LLM call is made by PatchDrill.
- No network call is added to default scan behavior.
- Repository commands run only through `patchdrill_run_verification` and only when the tool input includes `allowCommandExecution: true`.
- LLMs may interpret PatchDrill output, but they must not rewrite gate status, risk score, findings, command text, or evidence verification.

## Start The Server

From a repository:

```bash
patchdrill mcp
```

To make an editor or desktop client start the server for a specific repository regardless of the client's own working directory:

```bash
patchdrill mcp --workspace-root /path/to/repository
```

Or from npm without a global install:

```bash
npx --yes patchdrill mcp --workspace-root /path/to/repository
```

The server uses MCP stdio transport, which is the right default for local editor and desktop integrations. It writes JSON-RPC messages to stdout, so it does not print startup banners.

Example client configuration:

```json
{
  "mcpServers": {
    "patchdrill": {
      "command": "npx",
      "args": ["--yes", "patchdrill", "mcp", "--workspace-root", "/path/to/repository"]
    }
  }
}
```

By default, tool calls are constrained to the directory where the MCP server was started. To intentionally allow a single server process to scan other repositories, set:

```bash
PATCHDRILL_MCP_ALLOW_ANY_CWD=1 patchdrill mcp
```

Use that only for trusted local clients.

## Tools

| Tool | Default side effect | Runs commands? | Purpose |
| --- | --- | --- | --- |
| `patchdrill_scan` | none | no | Read the current diff and return a structured PatchDrill report plus gate summary. |
| `patchdrill_proof_pack` | writes report artifacts under a repository-relative output directory | no | Generate Markdown, JSON, SARIF, HTML, and evidence manifest artifacts for an agent or reviewer. |
| `patchdrill_run_verification` | writes report artifacts and command evidence | yes, only with `allowCommandExecution: true` | Execute inferred required commands and produce an evidence-backed Proof Pack. |
| `patchdrill_doctor` | none | no | Return first-run readiness diagnostics. |
| `patchdrill_verify_evidence` | none | no | Verify an evidence manifest and the referenced artifacts. |
| `patchdrill_release_check` | none | no | Return local release-readiness checks for PatchDrill itself. |

`patchdrill_proof_pack` and `patchdrill_run_verification` restrict `outputDirectory` to a repository-relative path that cannot escape the repository root. The default is `.patchdrill/mcp`.

## Resources

The server exposes stable resources for clients and prompts:

- `patchdrill://manifest`
- `patchdrill://schema/policy`
- `patchdrill://schema/report`
- `patchdrill://schema/evidence`
- `patchdrill://schema/doctor`
- `patchdrill://schema/release-check`
- `patchdrill://docs/mcp`
- `patchdrill://docs/rule-catalog`
- `patchdrill://docs/proof-packs`
- `patchdrill://docs/security-posture`

The schema resources let an MCP client validate structured report and evidence payloads before handing them to a model.

## Prompts

PatchDrill provides prompt templates for common review workflows:

- `patchdrill_explain_merge_risk`
- `patchdrill_draft_pr_comment`
- `patchdrill_triage_findings`
- `patchdrill_plan_verification`

The prompts tell the model to preserve deterministic PatchDrill facts exactly and separate facts from interpretation.

## Recommended Agent Flow

1. Call `patchdrill_scan`.
2. Read `gate`, `summary`, `topFindings`, `requiredCommands`, and `verification`.
3. Use `patchdrill_explain_merge_risk` or `patchdrill_draft_pr_comment` to turn the deterministic report into reviewer-facing language.
4. If a reviewer wants artifacts, call `patchdrill_proof_pack`.
5. If a human explicitly approves command execution, call `patchdrill_run_verification` with `allowCommandExecution: true`.
6. Call `patchdrill_verify_evidence` before trusting or archiving a generated Proof Pack.

## Safety Contract For LLMs

LLM output should follow these rules:

- Do not invent findings.
- Do not mark a failed PatchDrill gate as safe.
- Do not claim verification ran unless `commandResults` and `verification` say it ran.
- Preserve command strings exactly.
- Keep model judgment separate from deterministic PatchDrill evidence.

This lets PatchDrill become the proof backend for AI review agents without making the scanner itself probabilistic.
