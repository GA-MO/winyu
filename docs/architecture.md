# Cop — architecture

Cop is one Next.js app (App Router, Tailwind v4, Vexa tokens) with a demo cookie for identity. Everything a user sees comes from a request that carries an `AccessContext`; everything that produces a number goes through one semantic layer. This document is the map; `docs/plan.md` holds the phase plan and the acceptance criteria, `docs/demo.md` the demo script.

## The request path

```
Browser (Vexa react/chat + Cop chrome)
  │  cookie: cop_session=<userId>
  ▼
app/api/chat/route.ts
  → lib/server/session.ts        readAccess(cookies) → AccessContext
  → lib/server/request-context   runWithAccess / runWithTurn (AsyncLocalStorage)
  → lib/server/agent/handler.ts  createVexaHandler({ models, persona, rules, tools, toolTiers })
      tools = toolsForAccess(access)          the surface minus policy minus kill switch
      persona = personaFor(access, user, ctx) role, scope, memory facts (fenced as data)
  ▼
lib/server/agent/tools.ts        11 tools, each wrapped in withAudit
  → lib/data/query.ts            runMetric(query, access)
  → lib/server/alerts.ts         alerts and forecasts the engines produced
  → lib/server/handoff.ts        context packets, notifications, outbox
  ▼
Vexa spec stream → SpecView renders the catalog components
```

`AccessContext` is derived on the server from the cookie alone. No tool input can widen it: tools read it from the async context, never from their arguments.

## Layers

| Layer | Path | Responsibility |
|---|---|---|
| Contracts | `lib/contracts/` | Types and zod schemas shared by every package: `MetricQuery`, `MetricResult`, `Alert`, `ContextPacket`, `WidgetSpec`, `AuditEntry`, the tool surface table |
| Access | `lib/access/` | `policies.ts` (role → regions, brands, metric ACL, tool allow list), `enforce.ts` (tool filtering, kill switch, scope predicates), `raci.ts` (metric × region → responsible person), `suppression.ts` (min-cell rule) |
| Semantic | `lib/semantic/` | The metric registry (20 certified metrics with Thai labels, units, dims, owner, source system) and the synonym dictionary that maps Thai wording to metric and dimension ids |
| Data | `lib/data/` | Hand-written entity tables, the seeded generator, cached typed arrays, and `runMetric` — the only way to a number |
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

`lib/data/query.ts` takes a `MetricQuery` and an `AccessContext` and, in order:

1. resolves the metric definition, rejects unknown metrics and dims that the metric does not carry;
2. resolves filter values through the dictionary (Thai names → ids);
3. applies scope: a filter outside the caller's regions or brands is `PERMISSION_DENIED`; an unfiltered question is narrowed to the caller's scope and the narrowing is reported in `provenance.scopeApplied`;
4. aggregates over the cube by the requested dims and grain, then applies `compare` (`prev_period`, `prev_year`, `target`);
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

- **Permission is code.** Tool filtering happens before the handler sees the tool set; scope predicates are injected inside `runMetric`. Prompt text carries none of it.
- **Min-cell suppression.** `lib/access/suppression.ts` closes any roll-up of `ar_overdue`, `gross_margin` or `trade_spend` that aggregates fewer than three agents, so a one-distributor province cannot be read as that distributor's books. Naming the agent explicitly is a different question, governed by the metric ACL.
- **Everything that is not typed by the user is data.** Tool output, packets from other users and memory facts are fenced before they reach the prompt (`fenceAsData`).
- **Audit.** `withAudit` writes one entry per tool call: who, which tool, hashed arguments, decision (`allow` / `deny` / `masked`), rows returned, latency. `/admin` filters them; `lib/server/usage.ts` aggregates questions per day, top intents, unanswered questions and an estimated cost.
- **Red team.** `tests/red-team.test.ts` runs 60+ cross-scope probes per role as direct tool calls and fails on any leaked number.

## Models

`lib/server/models.ts` publishes the registry the chat endpoint exposes. Without `ANTHROPIC_API_KEY` only the scripted mock model is listed, and `lib/server/mock-script.ts` plays the demo scenes by calling the **real** tools, so every number in a scripted reply is real generator output. With a key, Claude Sonnet 5 is the default and Claude Haiku 4.5 is offered; the tools, the scope and the rules are identical either way.
