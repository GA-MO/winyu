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
```

Check the domain inside Next without a browser: `curl -s 'http://localhost:3200/api/health?user=<id>'`.

## Code rules

**Never write comments** (fix the name instead; one-line JSDoc on public exports only), names state intent, one function one thing, early return, `UPPER_CASE` constants at the top, no `any`, no new dependency when an existing one works.

- Identifiers, file names, commit messages: English. UI strings, personas, mock entity names, model replies: Thai (technical terms may stay English). No i18n framework; UI strings live in `lib/i18n/th.ts`.
- Numbers shown to users always come from a tool result or a server query, never from the model's memory. The model copies tool rows into component props; tools therefore return compact rows (≤ 60) with pre-formatted labels.
- Permission is enforced in code: `lib/access` filters tools per role before the agent sees them and injects scope filters into every semantic-layer query. The prompt never carries permission logic.
- Every tool runs through the harness gateway (`lib/harness/gateway.ts`): define tools with `defineTool` (native) or the connector definers. They return engine-neutral `WinyuTool`s whose `execute` is the gated call; an engine adapter (`lib/server/agent/ai-sdk-tools.ts` for the AI SDK) turns them into its own tool shape. A write tool declares a `verify` post-condition, and any tool whose arguments carry personal text declares them in `redact`.
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
