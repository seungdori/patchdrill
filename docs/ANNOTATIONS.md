# GitHub Actions Annotations

PatchDrill can emit GitHub Actions workflow-command annotations for findings:

```bash
patchdrill scan --base origin/main --github-annotations
```

The composite Action enables annotations by default:

```yaml
- uses: seungdori/patchdrill@v0
  with:
    base: origin/${{ github.base_ref }}
    annotations: "true"
```

`patchdrill init` writes this setting explicitly in the generated workflow so reviewers can see that Checks annotations are part of the default PR evidence.

Set `annotations: "false"` to disable Checks annotations. The Action accepts `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"`, `"on"`, and `"off"` for boolean inputs.

These annotations appear in the Actions log and Checks UI. They are meant for immediate review attention, while Markdown, JSON, SARIF, and HTML remain the durable artifacts.

## Severity Mapping

| PatchDrill | GitHub annotation |
| --- | --- |
| `critical` | `error` |
| `high` | `error` |
| `medium` | `warning` |
| `low` | `notice` |
| `info` | `notice` |

File-scoped findings include file and line metadata when available. Global findings are emitted without a file property.
