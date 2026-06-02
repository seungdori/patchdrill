# Rule Catalog

Every PatchDrill risk score increase maps to a human-readable finding. This catalog lists the built-in rule IDs so teams can understand reports, write policy exceptions, and decide which findings should block merges.

Policy rules from `.patchdrill.yml` use dynamic IDs in the form `policy.<rule-id>`.

## Patch Size and Shape

| Rule ID | What it means |
| --- | --- |
| `patch.changed-files` | The patch changes repository files and needs review evidence. |
| `patch.medium` | The patch changes more than 500 lines. |
| `patch.large` | The patch changes more than 2000 lines. |
| `file.deleted` | A file was deleted. |
| `file.binary` | A binary file changed. |

## Sensitive Files

| Rule ID | What it means |
| --- | --- |
| `file.secret-bearing` | A file path commonly used for credentials changed. |
| `file.high-impact-area` | Auth, billing, migration, or security-sensitive code changed. |
| `file.infrastructure` | Infrastructure, CI, build, or deployment behavior changed. |
| `file.lockfile` | A dependency lockfile changed. |
| `file.bun-lockb` | A legacy binary Bun lockfile changed. |
| `file.dependency-manifest` | A dependency manifest changed. |

## Secret Patterns

| Rule ID | What it means |
| --- | --- |
| `secret.private-key` | Private key material was added. |
| `secret.aws-access-key` | An AWS access key-looking value was added. |
| `secret.github-token` | A GitHub token-looking value was added. |
| `secret.openai-key` | An OpenAI API key-looking value was added. |
| `secret.generic-assignment` | A secret-looking assignment was added. |

## Agentic AI Surfaces

| Rule ID | What it means |
| --- | --- |
| `agent.control-file` | Agent instruction or control files changed. |
| `agent.mcp-config` | MCP or agent tool configuration changed. |
| `agent.prompt-injection` | Prompt-injection-like content was added. |
| `agent.tool-abuse-instruction` | Agent-visible content appears to encourage destructive commands or tool misuse. |

## GitHub Actions Trust Boundaries

| Rule ID | What it means |
| --- | --- |
| `workflow.pull-request-target` | A `pull_request_target` trigger was added. |
| `workflow.write-all` | Broad `permissions: write-all` was added. |
| `workflow.write-scope` | A GitHub token write scope was added. |
| `workflow.inherited-secrets` | `secrets: inherit` was added. |
| `workflow.unpinned-action` | A GitHub Action reference is mutable or missing a full commit SHA. |
| `workflow.mutable-docker-action` | A `docker://` action image is tag-based or implicitly latest instead of digest-pinned. |
| `workflow.remote-script-pipe` | A workflow pipes remote downloads directly into an interpreter. |
| `workflow.untrusted-pr-context` | A workflow interpolates untrusted pull request metadata. |
| `workflow.pull-request-target-head-checkout` | A privileged `pull_request_target` workflow checks out pull request head code. |
| `workflow.reusable-inherited-secrets` | A reusable workflow job inherits all caller secrets. |
| `workflow.reusable-unpinned-secret-call` | A mutable remote reusable workflow receives inherited secrets. |
| `workflow.pull-request-target-oidc` | A fork-triggerable `pull_request_target` workflow can mint OIDC tokens. |
| `workflow.environment-oidc-token` | A job targeting a GitHub environment can mint OIDC tokens. |
| `workflow.cloud-oidc-without-environment` | A cloud credential exchange can mint OIDC tokens without a GitHub environment gate. |
| `workflow.reusable-oidc-token-boundary` | A remote reusable workflow can mint caller OIDC tokens. |
| `workflow.reusable-unpinned-oidc-call` | A mutable remote reusable workflow can mint caller OIDC tokens. |

## Package Scripts

| Rule ID | What it means |
| --- | --- |
| `package-script.remote-script-pipe` | A package script downloads remote code directly into an interpreter. |
| `package-script.lifecycle` | An install, prepare, pack, publish, or related lifecycle script changed. |
| `package-script.disabled-verification` | A verification script appears to have been replaced with a no-op. |
| `package-script.removed-verification` | A conventional verification script was removed. |

## Dependency Proof Gaps

| Rule ID | What it means |
| --- | --- |
| `dependency.manifest-without-lockfile` | Direct dependency intent changed without matching lockfile evidence. |
| `dependency.lockfile-without-manifest` | Lockfile resolution drift occurred without matching direct dependency intent. |

## Verification Evidence

| Rule ID | What it means |
| --- | --- |
| `verification.required-not-run` | Required verification commands were planned but not executed. |
| `command.failed` | A verification command failed. |
| `test.source-without-test-change` | Source files changed without matching test files in the patch. |
