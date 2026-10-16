# Contributing to Winyu

This guide covers how a change moves from a branch to the demo. The code rules themselves are in `CLAUDE.md`. Read it before your first change.

## Branches

| Branch | Purpose |
|---|---|
| `main` | The current code. Every merge request targets it |
| `uat` | The deployed demo. A push builds the image and deploys it, once infra turns the pipeline on (see `docs/deploy.md`) |
| feature branches | One per change, named for the change, such as `fix-login-redirect` |

Promote to the demo by merging `main` into `uat`. Do not commit to `uat` directly.

## Before you open a merge request

Run these and paste the result lines into the merge request:

```bash
bun run typecheck
bun run test
bun run eval
```

- `bun run typecheck` must print no errors.
- `bun run test` must print `0 fail`. The suite never calls a model.
- `bun run eval` must report `0 with failures not in evals/known-failures.json`. It scores recordings and costs $0.

Then check the page or route you changed in the browser, for every role it touches. A passing test suite does not show that a page renders.

## Changes that cost money

Some changes make the recorded evals stale. They are changes to the prompt (`WINYU_RULES`, the personas) and changes to a tool's description or schema.

1. Run `bun run eval --stale` to list the stale recordings.
2. Run `bun run eval --live --changed` to print the estimate. It spends nothing.
3. Re-record only the cases you need, with a cap: `bun run eval --live --case=<ids> --yes --cap=0.10`.
4. State the spend in the merge request.

Never re-record every case by default. `CLAUDE.md` has the full cost rules.

## Rules that tests enforce

- `lib/harness/boundary.test.ts`: only `lib/harness/adapters/mastra/` imports `@mastra/*`, `@ag-ui/*`, or `@copilotkit/runtime`.
- `lib/server/light-requests.test.ts`: a request path that only checks the session (`lib/server/session.ts`, `lib/access/enforce.ts`, the feed, the home page) must not import the agent engine, the AI SDK, OpenRouter, or OpenTelemetry at module load. Load them with `await import()` at the point of use. Without this rule `next build` needs more memory than the CI runner has (see `docs/adr/0003-lazy-load-the-agent-engine.md`).

No test enforces this rule: a new dependency that only server code imports goes in `SERVER_ONLY_PACKAGES` in `next.config.ts`. Turbopack then loads it from `node_modules` instead of bundling it and everything it imports (see `docs/adr/0005-server-only-packages-stay-out-of-the-bundle.md`).

## Commit messages

Write the subject as what the change does for the user or the maintainer, in English, under 72 characters. Put the why in the body when it is not obvious.

## Data

- `.data/` is local state and is not committed. `bun run seed` rebuilds it.
- `deploy/seed-data/` is the snapshot the demo image starts from, and it is committed. Refresh it with `make demo-snapshot` only when the demo should start from new data, and say so in the merge request.
- Never commit `.env.local` or `deploy/.env`.
