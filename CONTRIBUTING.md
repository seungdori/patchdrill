# Contributing

PatchDrill is intentionally small and deterministic. Contributions should keep the default path fast to understand and easy to review.

## Development

```bash
npm install
npm run check
```

`npm run check` is the full confidence gate. It runs, in order, `build`
(emitting and type-checking `src/`), `typecheck` (type-checking `src/` **and**
`tests/` with no emit via `tsconfig.eslint.json`), `lint` (ESLint with
type-aware rules), and the test suite, which intentionally includes git-backed
integration fixtures. For a faster local edit loop, use `npm run test:fast`; use
`npm run test:integration` when changing scan orchestration, dependency diffing,
stack fixtures, or git-backed behavior.

The linter (`eslint.config.js`) enforces type-aware correctness rules such as
`no-floating-promises` and `no-unnecessary-condition`. Run `npm run lint:fix` to
auto-apply safe fixes. `.editorconfig` and `.gitattributes` keep formatting and
line endings consistent, which protects the byte-identical fixtures.

## Useful Commands

```bash
npm run build
npm run typecheck
npm run lint
npm run lint:fix
npm run test:fast
npm test
npm run test:integration
npm run test:coverage
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
- `npm pack --dry-run` passes for packaging, docs, action, or release changes.
- README or docs are updated when behavior changes.
- New commands are conservative and do not mutate the checkout.
- The pull request template includes verification evidence and compatibility notes.
