# Launch Playbook

PatchDrill is designed for developers who already use AI coding agents and want a concrete answer to "what proves this patch?"

## Positioning

One-liner:

> PatchDrill turns every AI-generated PR into a reviewable verification drill.

Short pitch:

> AI agents can write code quickly, but reviewers still need evidence. PatchDrill reads a git diff, infers what should be tested, flags risky areas, and writes a Markdown/JSON proof report for local review or CI.

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

## Star Hooks

- "No LLM required."
- "Evidence over vibes."
- "Works before your CI bill grows."
- "Review the plan before running commands."
- "Markdown for humans, JSON for bots."
