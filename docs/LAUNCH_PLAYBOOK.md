# Launch Playbook

PatchDrill is designed for developers who already use AI coding agents and want a concrete answer to "what proves this patch?"

## Positioning

One-liner:

> PatchDrill is a deterministic safety radar for AI-generated and human patches.

Short pitch:

> AI agents can write code quickly, but reviewers still need evidence. PatchDrill reads a git diff, infers what should be tested, flags risky areas, and writes Markdown, JSON, SARIF, and HTML proof artifacts for local review or CI.

Comparison:

- AI PR reviewers judge whether a patch looks right.
- Traditional CI runs commands that were already configured.
- PatchDrill turns the patch itself into a repeatable verification plan, risk report, and policy gate.

## Launch Checklist

- Publish npm package as `patchdrill`.
- Add a GIF or terminal recording to the README.
- Add fixtures for at least five popular stacks.
- Add SARIF output.
- Dogfood on 20 real pull requests and add anonymized example reports.
- Submit to GitHub Trending-adjacent communities: Hacker News Show HN, r/programming, r/ClaudeCode, r/codex, r/opensource, DevTools directories.
- Write a blog post: "AI made patches faster. Here is how to make review evidence faster too."

## Demo Script

```bash
git checkout -b demo/auth-change
echo "// pretend auth change" >> src/auth/session.ts
patchdrill scan
patchdrill scan --run --markdown patchdrill-report.md
```

Show:

- High-impact auth finding.
- Missing test-change finding.
- Inferred commands from `package.json`.
- Report artifact.
- SARIF upload in GitHub code scanning.
- `.patchdrill.yml` policy rule that requires owner review for a sensitive path.

## Star Hooks

- "No LLM required."
- "Evidence over vibes."
- "Not another AI reviewer. A deterministic safety gate."
- "Works before your CI bill grows."
- "Review the plan before running commands."
- "Markdown for humans, JSON for bots, SARIF for GitHub."
- "Detects prompt-injection strings before agents ingest them."
