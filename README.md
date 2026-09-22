# Cop

Enterprise copilot on Vexa for a fictional Thai beverage company. Every user signs in as a persona; the agent answers with generative UI scoped to that persona's data.

## Run

```bash
bun install
bun run dev          # http://localhost:3100 (redirects to /login until a persona is chosen)
bun run typecheck
bun run test         # 190+ tests, including tests/red-team.test.ts
bun run build
bun run seed         # clears .data/*.json (user state: threads, memory, packets)
```

`docs/demo.md` is the three-scene demo script (who to sign in as, what to type, what should appear).
`docs/architecture.md` explains the layers; `docs/plan.md` is the build plan with its acceptance criteria.

Vexa is consumed from the sibling checkout `../agentic-ui` (see `docs/plan.md` §3): tsconfig `paths` and `app/globals.css` point at `../agentic-ui/src`, `next.config.ts` allows that tree through `outputFileTracingRoot` and aliases `ai`, `ai/test` and `@ai-sdk/react` to Cop's copies so both trees share one module instance. Keep `ai`, `@ai-sdk/react` and `zod` pinned to the versions `../agentic-ui/node_modules` resolves.

Without `ANTHROPIC_API_KEY` in `.env.local` the model picker offers only `mock` (scripted replies, free). With the key set, `claude-sonnet-5` becomes the default and `claude-haiku-4-5-20251001` is also listed. Copy `.env.example` to `.env.local`.

## Personas

Pick one on `/login`; the top bar switches personas without signing out. Session cookie: `cop_session=<userId>` (httpOnly), set by `POST /api/session { userId }`, cleared by `DELETE /api/session`.

| User id | Name | Role | Scope |
|---|---|---|---|
| `u_thana` | คุณธนา วงศ์สกุล | ceo | ทั่วประเทศ, every metric |
| `u_siriporn` | คุณศิริพร รัตนกร | cfo | ทั่วประเทศ, avg_salary masked |
| `u_prasit` | คุณประสิทธิ์ ชัยภูมิ | sales_director | ทั่วประเทศ |
| `u_anucha` | คุณอนุชา พรหมศรี | sales_rsm | ภาคอีสาน only |
| `u_kanok`, `u_somchai`, `u_nattaya`, `u_wichai`, `u_saranya` | RSMs | sales_rsm | own region |
| `u_krit`, `u_nok`, `u_ploy`, `u_beam`, `u_arm`, `u_golf`, `u_ice` | sales reps | sales_rep | own region, no handoff/email tools |
| `u_ben` | คุณเบญ เตชะวงศ์ | marketing_lead | all regions, finance masked |
| `u_pim`, `u_fah`, `u_bank` | trade/brand marketing | marketing_lead | as above |
| `u_wee`, `u_oat` | คุณวีร์ เจริญสุข, คุณโอ๊ต | supply_planner | supply metrics |
| `u_mint`, `u_earn` | finance analysts | finance_analyst | finance full, HR none |
| `u_may` | คุณเมย์ กิตติศักดิ์ | hr_manager | HR incl. avg_salary |
| `u_ton` | คุณต้น อรุณรัตน์ | it_admin | run_job tool |

The full table with titles and managers is `lib/data/entities/users.ts`; the role policy table is `lib/access/policies.ts`.

## What it does

| Surface | Route | What happens there |
|---|---|---|
| Chat landing | `/` | Morning brief, learned quick-action chips, ambient cards, pinned dashboard blurred behind the composer |
| Session | `/c/[threadId]` | The conversation with generative UI inline; threads saved per user |
| Inbox drawer | bell icon | Handoff packets, alerts and replies; packet evidence is re-run under the reader's own scope |
| Dashboard | `/dashboard` (⌘D) | Pinned widgets, the suggested tray with its reason, layout rollback |
| Admin console | `/admin` | Roles, metric ACL, tool kill switch, filtered audit, usage and cost, "view as role" simulator (IT only) |
| Outbox | `/outbox` | What would have been emailed |

Four loops run behind those surfaces: anomaly detection and forecasting (`lib/engine`, `POST /api/jobs/run`), the quick-action recommender and memory (`lib/engine/recommend.ts`, `lib/engine/memory.ts`), handoff packets (`lib/server/handoff.ts`), and the dashboard composer (`lib/engine/compose.ts`).

## Governance

- **Scope is code.** `lib/access/policies.ts` derives an `AccessContext` from the cookie; `lib/data/query.ts` injects region and brand predicates into every query and returns `"***"` for masked metrics. The prompt carries no permission logic.
- **Min-cell suppression.** `lib/access/suppression.ts` closes a roll-up that aggregates fewer than three agents for `ar_overdue`, `gross_margin` and `trade_spend`, so a province with one distributor cannot be read as that distributor's books. Naming the agent is still governed by the metric ACL.
- **Red team.** `tests/red-team.test.ts` fires 60+ cross-scope probes per role — other regions, other brands, salary, other users' memory, packets addressed to someone else, disallowed tools — and fails if a single number crosses a boundary.
- **Audit.** Every tool call writes an `AuditEntry` (who, tool, hashed args, decision, rows, latency), readable and filterable in `/admin`.

## Ports

| Port | What |
|---|---|
| 3100 | Cop (`bun run dev`) |
| 3001 | Vexa shop-admin reference host (`bun run dev` inside `../agentic-ui`) |

## Layout

```
app/(app)/           chat landing, /c/[threadId], /dashboard, /admin, /outbox
app/api/             chat, session, threads, inbox, alerts, memory, quick-actions, dashboard, jobs
components/          chat, landing, dashboard, inbox, threads, composer, chrome, ui primitives
lib/contracts/       types + zod schemas every package builds against (docs/plan.md §4)
lib/access/          role → regions / brands / metric ACL / tool allow list, kill switch, min-cell suppression
lib/semantic/        metric registry and the Thai synonym dictionary
lib/data/            entity tables, the seeded generator, the cube and runMetric
lib/engine/          anomaly, forecast, hypothesis, recommender, memory, dashboard composer
lib/server/          session, request context (AsyncLocalStorage), agent tools and handler, alerts, briefing, handoff, threads, dashboard, usage, audit, JSON store, mock script
lib/dashboard/       widget → Vexa spec, role templates, ambient cards
lib/i18n/th.ts       every UI string
tests/               cross-cutting suites (red team)
scripts/             seed, data inspector, happy-dom test preload
```
