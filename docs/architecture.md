# Winyu — architecture

Winyu is one Next.js app (App Router, Tailwind v4, Vexa tokens) with a demo cookie for identity. Everything a user sees comes from a request that carries an `AccessContext`; everything that produces a number goes through one semantic layer. This document is the map; `docs/plan.md` holds the phase plan and the acceptance criteria, `docs/demo.md` the demo script.

## The request path

```
Browser (Vexa react/chat + Winyu chrome)
  │  cookie: winyu_session=<userId>
  ▼
app/api/chat/route.ts
  → lib/server/session.ts                  readAccess(cookies) → AccessContext
  → lib/harness/adapters/vexa/agent.ts     serveChat: one run per request (run id = turn id), goal, ui.action / approval events,
                                           transcript window, AsyncLocalStorage for access, turn and run; trace saved when the reply ends
  → lib/server/agent/handler.ts            vexaEngine({ catalog, models, persona, rules, tools, toolTiers }, approvalSecret)
      tools = toolsForAccess(access)          the surface minus policy minus kill switch
      persona = personaFor(access, user, ctx) context items (source, priority, scope) under a budget; memory ranked by the question
  ▼
lib/harness/gateway.ts                   every tool call: policy → tool under a timeout → observation → verification → recovery → one audit row
  → lib/server/tools/*.ts                each tool's execute and its post-condition (lib/server/tools/verify.ts)
  → lib/server/metrics.ts                runMetric(query, access): plan → ports().metrics.readFacts → finish
  → lib/server/alerts.ts                 alerts and forecasts the engines produced
  → lib/server/handoff.ts                context packets, notifications, outbox
  ▼
Vexa spec stream → SpecView renders the catalog components
```

`docs/harness.md` describes the harness: run state, events, the gateway, verification, recovery and the Vexa boundary. `bun run trace [runId]` prints one run.

`AccessContext` is derived on the server from the cookie alone. No tool input can widen it: tools read it from the async context, never from their arguments.

## Layers

| Layer | Path | Responsibility |
|---|---|---|
| Contracts | `lib/contracts/` | Types and zod schemas shared by every package: `MetricQuery`, `MetricResult`, `Alert`, `ContextPacket`, `WidgetSpec`, `AuditEntry`, the tool surface table |
| Access | `lib/access/` | `policies.ts` (role → regions, brands, metric ACL, tool allow list), `enforce.ts` (tool filtering, kill switch, scope predicates), `raci.ts` (metric × region → responsible person), `suppression.ts` (min-cell rule) |
| Semantic | `lib/semantic/` | The metric registry (20 certified metrics with Thai labels, units, dims, owner, source system), the synonym dictionary that maps Thai wording to metric and dimension ids, and `engine.ts` — `planMetric` / `finishMetric`, everything about a number except reading it |
| Data | `lib/data/` | Hand-written entity tables, the seeded generator, cached typed arrays, and `facts.ts` — the generator as a warehouse that answers `FactRequest`s |
| Engine | `lib/engine/` | Deterministic analytics: anomaly detection, hypotheses, Holt-Winters forecasting, the quick-action recommender, memory extraction, the dashboard composer |
| Server | `lib/server/` | Session, request context, the agent handler and tools, alerts and briefing jobs, handoff, threads, dashboard layouts, usage, audit, the JSON store, the mock script |
| Presentation | `lib/dashboard/`, `components/` | Widget → Vexa spec, role templates, ambient cards, and the React surfaces |

Server-only modules (`lib/server/**`, anything importing `vexa/server`, `node:*` or `.data`) are never imported from a client component.

## The data model

The business data is generated, not stored. `lib/data/generator.ts` seeds `mulberry32(20260922)` and produces 18 months of daily facts (2025-04-01 → 2026-09-22) that are cached as typed arrays on first access.

```
volume(sku, agent, date) = base(sku) × agentWeight × regionMix(brand, region) × seasonality(brand, date)
                         × dow(date) × promoUplift(campaign) × lentDip(beer) × noise(hash) × anomaly(...)
```

| Domain | Entities | Facts |
|---|---|---|
| Org | 3 business units, 6 regions, 24 provinces, 26 users | — |
| Products | 8 brands, ~30 SKUs with pack, HL per case, price | — |
| Sales | 40 distributors (agents) with tier and credit days, 4 channels | sell-in, sell-out (lagged 3–10 days), value, target |
| Supply | 3 plants with lines, 8 distribution centres | production output, capacity utilisation, stock on hand, days of cover |
| Marketing | 8 campaigns, competitors anonymised | spend, reach, uplift, share of voice, sentiment |
| Finance | budget per BU, trade-spend budget per region, AR terms | gross margin, trade spend, AR overdue |
| HR | 8 departments | headcount, attrition, average salary (masked for most roles) |

Seven anomalies are injected on purpose (`lib/data/anomalies.ts`); the detection engine must find them and the demo scenes rely on them.

`.data/*.json` holds **user state only** — threads, memory facts, packets, notifications, outbox, dashboard layouts and their versions, alerts, forecasts, killed tools, audit. `bun run seed` deletes those files; no business data is lost.

## `runMetric`, the one door to a number

`lib/server/metrics.ts` takes a `MetricQuery` and an `AccessContext`. `planMetric` (steps 1–3) and `finishMetric` (steps 5–6) live in `lib/semantic/engine.ts`; step 4 is the only one that leaves Winyu: `ports().metrics.readFacts(FactRequest[])`. A request carries resolved ids already narrowed to the caller's scope and never the `AccessContext`, so a real warehouse behind the port answers aggregates and nothing else; ACL, masking, suppression and the compare window stay in Winyu. `lib/data/query.ts` keeps a synchronous `runMetric` over the generator for tests and scripts. Names and geography come from the same port: `ports().metrics.masterData()` returns the dimension tables, `loadDictionary()` (`lib/server/master-data.ts`) builds the dictionary from them and keeps it ten minutes, and every label, filter resolution and region-of-a-value check reads that dictionary, so scope follows the warehouse's own master data. In order:

1. resolves the metric definition, rejects unknown metrics and dims that the metric does not carry;
2. resolves filter values through the dictionary (Thai names → ids);
3. applies scope: a filter outside the caller's regions or brands is `PERMISSION_DENIED`; an unfiltered question is narrowed to the caller's scope and the narrowing is reported in `provenance.scopeApplied`;
4. asks the warehouse for the aggregate by the requested dims, plus the comparison window (`prev_period`, `prev_year`) or the plan (`target`), with the prior window's time labels shifted onto the current one (`labelShift`);
5. masks the value fields when the metric ACL says `masked`, and suppresses rows whose cohort is below `MIN_CELL_SIZE`;
6. returns rows (≤ 60, pre-formatted labels), a one-sentence Thai summary, and `provenance` (source system, certified flag, as-of date, filters, scope, masked fields, trust).

The model never does arithmetic: it copies rows into component props. That is what makes a number on screen traceable to a query.

## The four loops

| Loop | Entry point | What it does |
|---|---|---|
| Detect | `POST /api/jobs/run` → `lib/server/alerts.ts` | Residual after weekly seasonality, rolling z-score, CUSUM level shift, plus a floor rule for days-of-cover; each alert carries severity, a hypothesis and two verify steps, and an owner from the RACI table |
| Predict | same job → `lib/engine/forecast.ts` | Holt-Winters with a damped trend over weekly aggregates, ±1.28σ band, MAPE from a 12-week backtest |
| Learn | `lib/engine/recommend.ts`, `lib/engine/memory.ts` | Every turn writes an `ActionEvent`; the recommender scores frequency, recency, time of day, peer lift and context similarity into 4 learned chips plus 2 seasonal ones, each with a reason. Memory extracts facts per turn, dedupes and decays them |
| Hand over | `lib/server/handoff.ts` | `create_handoff` (approval-gated) writes a `ContextPacket` carrying the **queries**, not the values; the recipient's inbox re-runs each query under the recipient's scope |

The dashboard composer (`lib/engine/compose.ts`) sits beside them: it clusters repeated intents into at most one new suggested card per user per day, and pinned cards never move by themselves.

## Governance

- **Permission is code.** Tool filtering happens before the handler sees the tool set, and the harness gateway authorizes every call again when it executes, whoever calls it; scope predicates are injected inside `runMetric`, and `query_metric` answers are checked for out-of-scope rows before the model sees them. Approvals are signed by the server. Prompt text carries none of it.
- **Min-cell suppression.** `lib/access/suppression.ts` closes any roll-up of `ar_overdue`, `gross_margin` or `trade_spend` that aggregates fewer than three agents, so a one-distributor province cannot be read as that distributor's books. Naming the agent explicitly is a different question, governed by the metric ACL.
- **Everything that is not typed by the user is data.** Tool output, packets from other users and memory facts are fenced before they reach the prompt (`fenceAsData`).
- **Audit.** The harness gateway writes one entry per tool call from what it observed: who, which tool, hashed arguments, decision (`allow` / `deny` / `masked`), rows returned, latency, tool call id and run id. Each run's full event trace (goal, context, model steps, policy, approvals, observations, verification, recovery, completion) is kept in `.data/runs.json`. `/admin` filters them; `lib/server/usage.ts` aggregates questions per day, top intents, unanswered questions and an estimated cost.
- **Red team.** `tests/red-team.test.ts` runs 60+ cross-scope probes per role as direct tool calls and fails on any leaked number.

## Models

`lib/server/models.ts` publishes the registry the chat endpoint exposes. Without `ANTHROPIC_API_KEY` only the scripted mock model is listed, and `lib/server/mock-script.ts` plays the demo scenes by calling the **real** tools, so every number in a scripted reply is real generator output. With a key, Claude Sonnet 5 is the default and Claude Haiku 4.5 is offered; the tools, the scope and the rules are identical either way.
