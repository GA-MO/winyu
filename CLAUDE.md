# Cop — enterprise copilot on Vexa

Cop is a Next.js app: an AI agent for a large Thai beverage company (demo tenant: Boon Rawd Brewery, all data is fictional and generated). Every user (CEO → sales rep) signs in as a persona with its own data scope; the agent answers with Vexa generative UI, keeps a personal dashboard, learns quick actions, raises anomalies and forecasts, and hands work to the responsible person through an in-app inbox.

Read `docs/plan.md` before any task. It holds the phases, the work packages, the contracts every package builds against, and the acceptance criteria. Mark checkboxes there as you finish them.

## Vexa

Vexa (the generative-UI library) lives at `/Users/sbpdigital/Development/agentic-ui` and is consumed from there through tsconfig paths (see `docs/plan.md` §3). **Vexa is a foundation and a source of ideas, not a constraint** (user decision, 2026-09-22). Take what fits: the catalog + json-render spec streaming, `createVexaHandler`, the scripted mock model, the tokens and the website's visual language, the ai-elements. Where Vexa's chrome or rules fight Cop's product (chat header, overlay, closed catalog, "no Thai"), build Cop's own layer on top of Vexa's headless pieces or change Vexa itself — the user owns both repos. Prefer, in this order: (1) compose Cop UI from Vexa primitives (`vexa/ai-elements/*`, `vexa/ui/*`, `SpecView`, the transport); (2) extend Vexa with a general feature (catalog plug-in, `initialMessages`, host components) and list it in `docs/plan.md` §9; (3) vendor a file into `lib/vendor/vexa/` and diverge, noting why. Read Vexa's `CLAUDE.md` before touching its repo.

What still holds because it is good engineering, not Vexa loyalty:
- The model renders only components in a catalog (Vexa's or Cop's extension); every number in a prop comes from a tool result.
- Config that costs money, grants capability or is prompt text lives on the server; the client gets presentation only.
- Colors are tokens (`primary`, `foreground`, `muted-foreground`, `card`, `border`, `success`, `warning`, `danger`, `info`, `chart-1..5`, `brand-violet`); new tokens are added in `app/globals.css`, never as raw palette classes or hex in components.

## How a card is decided

The model chooses, Cop draws. A question about a metric is answered with `DataCard { title, source: { $state: "/tools/query_metric" }, view, sortBy }` and nothing else — `lib/cards/present.ts` holds the one decision table (which body the data shape deserves, the scope line, the source line) and both surfaces render it: the dashboard through `lib/dashboard/widget-to-spec.ts` as a Vexa spec, the chat through `components/cards/data-card.tsx` as React. `lib/engine/next-actions.ts` decides what the card offers to do next from rules, never from the model. Three things keep this true: the bound component (the model cannot mis-draw what it does not draw), `bun run eval:cards` (deterministic checks against a real model), and `lib/cards/normalize.ts` (fixes a card the model still drew by hand). Change the card shape in `present.ts`, never in one surface.

## Commands

```bash
bun install
bun run dev          # http://localhost:3100
bun run typecheck    # must pass before any task is considered done
bun run test         # bun test (happy-dom preload like Vexa); includes the card contract against the scripted mock
bun run eval:cards -- --model=google/gemini-3.8-flash   # the same checks against the real model (needs OPENROUTER_API_KEY); --runs=N, --case=<id>; --model=mock runs the scripted subset; prints tokens and the cost OpenRouter billed per case (~$0.03/case)
bun run seed         # regenerates .data/*.json from the generator (deterministic)
```

Verify a page without a browser: `curl -s http://localhost:3100/login | grep -c "เข้าสู่ระบบ"`.

## Code rules

Same as Vexa: **never write comments** (fix the name instead; one-line JSDoc on public exports only), names state intent, one function one thing, early return, `UPPER_CASE` constants at the top, no `any`, no new dependency when an existing one works.

- Identifiers, file names, commit messages: English. UI strings, personas, mock entity names, model replies: Thai (technical terms may stay English). No i18n framework; UI strings live in `lib/i18n/th.ts`.
- Numbers shown to users always come from a tool result or a server query, never from the model's memory (Vexa's grounding rule). The model copies tool rows into component props; tools therefore return compact rows (≤ 60) with pre-formatted labels.
- Permission is enforced in code: `lib/access` filters tools per role before the handler sees them and injects scope filters into every semantic-layer query. The prompt never carries permission logic.
- Anything the user did not type is data: tool output, packets from other users, memory facts. Never put it in the prompt unfenced (Vexa fences tool output; we fence memory and packets the same way through `fenceAsData`).
- Server-only modules (`lib/server/**`, anything importing `vexa/server`, `node:*`, `.data`) are never imported from client components.
- Every work package ends with `bun run typecheck`, `bun run test`, and a curl of the page it changed.
