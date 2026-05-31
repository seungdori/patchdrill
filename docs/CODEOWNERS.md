# CODEOWNERS

PatchDrill reads GitHub CODEOWNERS files and adds owner hints to changed files in Markdown and JSON reports.

Search order matches GitHub:

- `.github/CODEOWNERS`
- `CODEOWNERS`
- `docs/CODEOWNERS`

When multiple rules match a file, the last matching rule wins. A matching rule with no owners clears owners for that path, which mirrors common CODEOWNERS usage for subdirectory exceptions.

## Supported Syntax

PatchDrill supports the common GitHub CODEOWNERS subset:

- `*`, `?`, and `**` wildcards.
- Root-anchored patterns such as `/src/`.
- Directory patterns such as `apps/`.
- Inline comments after owner tokens.
- GitHub users, teams, and email owners as raw strings.

PatchDrill skips unsupported negation (`!`) and bracket range patterns (`[a-z]`), matching GitHub's documented CODEOWNERS limitations.
