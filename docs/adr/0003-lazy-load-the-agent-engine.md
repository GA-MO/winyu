# 0003. Load the agent engine only on the paths that run it

Accepted, 2026-10-15.

## Context

`next build` was killed for lack of memory in a 4 GB Docker VM. Almost every route reaches `lib/server/session.ts`, which imports `lib/access/enforce.ts`, which imports `lib/server/tools/registry.ts`, which imports every tool implementation. Five of those imports pulled in Mastra, the AI SDK, OpenRouter, the MCP client, and OpenTelemetry. As a result, 43 of 54 server entries bundled the agent engine, and `.next/server` was 534 MB, 441 MB of it source maps.

## Decision

Keep the tool metadata where it is. Move each heavy dependency behind `await import()` at its point of use: the model call in `lib/engine/compose.ts`, the A2A client in `lib/server/tools/ask-logistics-partner.ts`, and the entry points into Mastra in `recall.ts`, `history.ts`, `jobs.ts`, and `mcp-client.ts`. Read stored investigations through `lib/server/investigations.ts`, so pages that only show them do not load the agent.

`lib/server/light-requests.test.ts` fails when a session-only path imports the agent engine at module load again.

## Consequences

- 5 of 54 server entries bundle Mastra, and `.next/server` is 92 MB.
- `docker build` passed once in 4 GB, then was killed three times in the TypeScript step with the same code. A 4 GB build is not reliable. Kaniko, which CI uses, needs more (about 6 GB, estimated).
- The first call to those tools after a server start pays the module load once.
- A new import in the session path must be checked against the test. Splitting tool metadata from implementations is the next step if the test becomes hard to satisfy.
