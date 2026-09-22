# Cop — enterprise copilot on Vexa

Cop is a Next.js app: an AI agent for a large Thai beverage company (demo tenant: Boon Rawd Brewery, all data is fictional and generated). Every user (CEO → sales rep) signs in as a persona with its own data scope; the agent answers with Vexa generative UI, keeps a personal dashboard, learns quick actions, raises anomalies and forecasts, and hands work to the responsible person through an in-app inbox.

Read `docs/plan.md` before any task. It holds the phases, the work packages, the contracts every package builds against, and the acceptance criteria. Mark checkboxes there as you finish them.

## Vexa

Vexa (the generative-UI library) lives at `/Users/sbpdigital/Development/agentic-ui` and is consumed from there (see `docs/plan.md` §3 for how it is wired). Read its `CLAUDE.md` before touching anything under `vexa/*`. Its rules that also apply here:

- The catalog is closed: the model renders only catalog components. Adding one touches five places in the Vexa repo (its CLAUDE.md lists them); prefer composing existing components.
- Config that costs money, grants capability or is prompt text lives on the server (`createVexaHandler`); the client gets presentation only. Never add a client-controlled field that changes server behaviour.
- Colors are tokens only (`primary`, `foreground`, `muted-foreground`, `card`, `border`, `success`, `warning`, `danger`, `info`, `chart-1..5`). Never a raw Tailwind palette color or hex in app code. The design system is Vexa's (`DESIGN.md` there: indigo → violet, colored shadows, elevated cards).
- Vexa must stay usable by other hosts: a change to Vexa is a general feature with a scenario, never a Cop-specific hack. Keep such changes minimal and list them in `docs/plan.md` §9.

## Commands

```bash
bun install
bun run dev          # http://localhost:3100
bun run typecheck    # must pass before any task is considered done
bun run test         # bun test (happy-dom preload like Vexa)
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
