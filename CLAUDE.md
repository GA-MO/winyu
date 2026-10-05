# mascop — enterprise copilot on Mastra + CopilotKit

mascop is the Winyu copilot rebuilt on Mastra (the agent) and CopilotKit (the chat UI over AG-UI). It serves the same 26 personas of a large Thai beverage company (demo tenant: Boon Rawd Brewery, all data fictional and generated) with the same tools, permissions, harness gateway and audit. The UI may differ from Winyu.

mascop is a standalone project. It has no dependency on the Winyu or Vexa repositories: no path aliases, imports, relative paths or runtime reads into them. Code that came from them was copied in and is owned here.

Read `docs/plan.md` before any task. It holds the phases, the contracts and the acceptance criteria. Mark checkboxes there as you finish them.

## Commands

```bash
bun install
bun run dev          # http://localhost:3200
bun run typecheck    # must pass before any task is considered done
bun run test         # bun test (happy-dom preload)
bun run seed         # regenerates .data/*.json from the generator (deterministic)
bun run probe:chat   # drives /api/copilotkit with session cookies against the dev server: CEO, sales rep, pin approve, pin decline (~11 Gemini calls); --only=a,b
bun run probe:durable --disconnect   # cuts a live chat run at its first tool call and checks trace, memory and the connect replay (~2 Gemini calls); --start, restart the server, then --check for the restart test
bun run trace [runId] # prints one agent run's harness trace (latest when no id)
bun run call-tool <userId> <tool> [json]   # runs one tool through the gateway as that user and prints the audit decision (no model call)
bun run mcp:probe <token> [--url=…/api/mcp] [--legacy]   # connects the official MCP client with an admin-issued token, lists tools and calls query_metric (no model call); see docs/mcp.md
bun run connectors:demo   # serves the demo connectors: LMS over MCP on :3299, CRM over REST on :3298
bun run investigate -- --users=<id>[,<id>…]|all [--save] [--show] [--replay]   # the morning investigation per person against the real model (~7 calls each); --show and --replay read saved runs without calling the model
bun run studio       # development only: Mastra API on :3214 over the app's own Mastra instance and Studio on http://localhost:3213; pick a persona preset (u_thana, u_krit, …) in the agent's Request context before chatting
bun run eval         # scores the recorded eval cases with code-only scorers, $0 (see Evals)
```

Mastra tracing is always on and stays on this machine: every agent run writes its spans to `.data/mastra.db`, and a chat run's Mastra trace id is derived from its harness run id (`traceIdOfRun` in `lib/harness/trace-link.ts`; the run id is also on the trace as `harnessRunId`). `bun run trace` and the admin run trace print or link the Studio trace in development. Set `MASCOP_OTEL_ENDPOINT` (an OTLP/HTTP traces URL such as `http://localhost:4318/v1/traces`) to also export spans to an OpenTelemetry collector; spans carry prompts, tool arguments and results, so point it only at a collector you control. Studio runs the agent with the persona from its request context: tools still pass the gateway (scope, policy, audit with initiator `system`), and a request without a persona is granted no instructions and no tools.

Set `MASCOP_SCHEDULER=off` before `bun run dev` when you do not want the background jobs (anomaly, forecast, watches, digest) to start and spend model calls. The jobs are Mastra scheduled workflows on Bangkok cron (`lib/harness/adapters/mastra/jobs.ts`); the morning investigation is a workflow started in the background (`POST /api/jobs/run {"job":"investigate","user":…}` returns a run id, `GET /api/jobs/run?run=<id>` its progress). The chat agent is a Mastra durable agent: a run survives a closed tab, and a run cut off by a restart is finished on the next boot with its whole trace (`docs/harness-mastra.md`).

Check the domain inside Next without a browser: `curl -s 'http://localhost:3200/api/health?user=<id>'`.

## Evals

`bun run eval` grades the chat against 58 cases ported from Winyu's `eval:cards` (`lib/eval/cases.ts`). Each case has one recording in `evals/recordings/<case>.json`: the question, the model's reply as ordered steps (text with its card block, tool calls with arguments and results), the approvals it raised, its cost, and hashes of the prompt and the tool surface. Scoring replays the recording through the live card stream (`ReplyCards`, `present.ts`, the composer) and runs code-only Mastra scorers (`lib/harness/adapters/mastra/scorers.ts`, checks in `lib/eval/checks.ts`). No judge model, no call, $0.

```bash
bun run eval                                   # score every recording, print the table, exit 1 on a failure not in evals/known-failures.json
bun run eval --case=<id>[,<id>…]               # score some cases
bun run eval --stale                           # recordings whose prompt, tools, model or question changed since they were recorded
bun run eval --live --changed                  # print the estimate for re-recording the stale and missing cases; spends nothing
bun run eval --live --case=<ids> --yes --cap=0.10   # re-record those cases against the real model, stopping before the cap
bun run eval --accept                          # accept today's failures as the baseline in evals/known-failures.json
```

Cost rules:
- Score from recordings by default. A change to `present.ts`, the composer, the card stream or a check is graded from recordings for $0.
- A change to the prompt (`WINYU_RULES`, the persona) or to a tool's description or schema makes recordings stale; `--stale` lists them. Re-record only those, with `--live --changed`, after reading the printed estimate (cases × median recorded cost).
- A prompt or tool change never fails `bun run eval` by itself, because the recordings still hold the old model's answers. Run `--stale` before trusting a green run after such a change.
- A live run needs `--yes` and stops before any case that could pass `--cap` (default $0.25). Set `EVAL_SPEND_METER=<path to a spend script>` to also stop when that script exits 2.
- A live run seeds a temporary data folder, turns memory extraction off, and copies its model calls into `.data/model-calls.json` as source `eval`.
- `bun test` never calls a model: `lib/eval/recordings.test.ts` scores the recordings.

## Code rules

**Never write comments** (fix the name instead; one-line JSDoc on public exports only), names state intent, one function one thing, early return, `UPPER_CASE` constants at the top, no `any`, no new dependency when an existing one works.

- Identifiers, file names, commit messages: English. UI strings, personas, mock entity names, model replies: Thai (technical terms may stay English). No i18n framework; UI strings live in `lib/i18n/th.ts`.
- Numbers shown to users always come from a tool result or a server query, never from the model's memory. The model copies tool rows into component props; tools therefore return compact rows (≤ 60) with pre-formatted labels.
- Permission is enforced in code: `lib/access` filters tools per role before the agent sees them and injects scope filters into every semantic-layer query. The prompt never carries permission logic.
- Every tool runs through the harness gateway (`lib/harness/gateway.ts`): define tools with `defineTool` (native) or the connector definers. They return engine-neutral `WinyuTool`s whose `execute` is the gated call; an engine adapter (`lib/harness/adapters/mastra/` for the chat agent, `lib/server/agent/ai-sdk-tools.ts` for AI SDK jobs) turns them into its own tool shape. Only `lib/harness/adapters/mastra/` imports `@mastra/*`, `@ag-ui/*` and `@copilotkit/runtime` (enforced by `lib/harness/boundary.test.ts`). On the client, only `components/chat/use-chat-session.ts` (headless `useAgent`) and `components/providers/copilot-provider.tsx` import `@copilotkit/react-core/v2`; the rest of the UI reads the transcript through `components/chat/timeline.ts`. A write tool declares a `verify` post-condition, and any tool whose arguments carry personal text declares them in `redact`.
- Anything the user did not type is data: tool output, packets from other users, memory facts. Never put it in the prompt unfenced; use `fence` / `fenceAsData` from `lib/harness/fence.ts`.
- Config that costs money, grants capability or is prompt text lives on the server; the client gets presentation only.
- Colors are tokens (`primary`, `foreground`, `muted-foreground`, `card`, `border`, `success`, `warning`, `danger`, `info`, `chart-1..5`, `brand-violet`); new tokens are added in `app/globals.css`, never as raw palette classes or hex in components.
- Server-only modules (`lib/server/**`, `node:*`, `.data`) are never imported from client components.
- Every work package ends with `bun run typecheck`, `bun run test`, and a curl of the page or route it changed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
