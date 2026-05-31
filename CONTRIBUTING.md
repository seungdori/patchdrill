# Contributing

PatchDrill is intentionally small and deterministic. Contributions should keep the default path fast to understand and easy to review.

## Development

```bash
npm install
npm run check
```

## Useful Commands

```bash
npm run build
npm test
node dist/cli.js scan
```

## Adding Rules

Risk rules live in `src/risk.ts`. Command inference lives in `src/planner.ts`. Project detection lives in `src/project.ts`.
Policy loading lives in `src/policy.ts`. SARIF and Markdown rendering live in `src/report.ts`.

When adding a rule:

1. Add a fixture-style test that demonstrates the behavior.
2. Keep findings explainable.
3. Prefer a specific path pattern over a broad one.
4. Avoid network calls in deterministic scan mode.
5. Do not include secret-like literal values in fixtures unless they are deliberately synthetic and covered by tests that ensure reports do not echo them.

## Pull Request Checklist

- The change is covered by tests or fixture evidence.
- `npm run check` passes.
- README or docs are updated when behavior changes.
- New commands are conservative and do not mutate the checkout.
