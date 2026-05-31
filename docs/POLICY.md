# Policy-As-Code

PatchDrill reads `.patchdrill.yml`, `.patchdrill.yaml`, or `.patchdrill.json` from the repository root. You can also pass a custom path:

```bash
patchdrill scan --config security/patchdrill.yml
```

Policy files are validated when loaded. Invalid severities, unknown fields, malformed command entries, and malformed rules fail the scan instead of being silently ignored.

Create a starter policy:

```bash
patchdrill init --policy
```

Create a stricter starter pack:

```bash
patchdrill init --policy-pack regulated
patchdrill init --policy-pack agentic
```

Built-in packs:

| Pack | Focus |
| --- | --- |
| `default` | General repo hygiene and agent instruction review. |
| `regulated` | Payments, identity/access, data migrations, release infrastructure, and lower default risk tolerance. |
| `agentic` | Agent instructions, MCP/tool configs, prompt templates, and AI workflow trust boundaries. |

## Example

```yaml
failOn: high
maxRisk: 69

ignoredPaths:
  - generated/**
  - dist/**

requiredCommands:
  - id: contract-tests
    label: API contract tests
    command: npm run test:contracts
    reason: API surfaces changed.

optionalCommands:
  - id: playwright-smoke
    label: Browser smoke test
    command: npm run test:smoke
    reason: UI routes changed.

rules:
  - id: payments-owner-review
    title: Payments owner review required
    severity: critical
    path: src/payments/**
    detail: Payment logic is high-impact and needs domain-owner sign-off.
    remediation: Add reviewer notes with test evidence, rollback notes, and owner approval.
    tags:
      - payments
      - owner-review
```

## Fields

| Field | Purpose |
| --- | --- |
| `failOn` | Default CLI failure threshold when `--fail-on` is not passed. |
| `maxRisk` | Default numeric risk threshold when `--max-risk` is not passed. |
| `ignoredPaths` | Glob patterns removed from changed-file and added-line analysis. |
| `requiredCommands` | Commands PatchDrill runs when `--run` is set. |
| `optionalCommands` | Commands shown in the report but not executed by default. |
| `rules` | Path-based findings with custom severity, weight, remediation, and tags. |

## Glob Support

PatchDrill supports `*`, `**`, and `?` path globs.

```yaml
ignoredPaths:
  - generated/**
  - "**/*.snap"
```

## Review Guidance

Use policy for repo-specific invariants that generic tools cannot know:

- Domain-owner review for payments, permissions, or ML model policy.
- Extra contract tests for public API schema changes.
- Release-manager review for deployment and infrastructure paths.
- Generated-code ignore rules where source-of-truth files are reviewed elsewhere.
