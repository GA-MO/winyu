# Cop — build plan

Status: **In progress** · Revision 2 · 2026-09-22 · phase 1 done, phase 2 next.

Cop is the enterprise copilot described in the brainstorm of 2026-09-22 (four angles: executive/governance, daily user, architecture, red-team). This plan turns it into a runnable demo on Vexa with a full-lifecycle mock of a Thai beverage company, built by parallel agents. Everything here is the deliverable; the chat summary is not.

## 1. What we are building

One Next.js app, signed-in personas. **UX principle (decided with the user on 2026-09-22): this is an AI agent, not an admin system.** The chat is the front door, the dashboard is the ambient backdrop, everything else is a drawer or a card inside the chat. Visual language = the Vexa website (dark-first, indigo→violet glow blobs, glass panels, elevated cards with colored shadows, gradient display text). No sidebar of admin menus.

| Surface | Route | What it does |
|---|---|---|
| Home = chat landing | `/` | Full-viewport: the user's pinned dashboard cards sit **behind** the chat, blurred and dimmed (parallax on scroll, ⌘D / "ดูแดชบอร์ด" brings them to the front at full opacity). In front: a gradient greeting, **Cop speaks first** (one-sentence morning brief: alerts found overnight, handoffs waiting), a large glowing composer, 4–6 learned quick-action chips, and 2–3 **ambient cards** (top alert, brief, handoff waiting) rendered as Vexa specs — clicking one starts a session with that context |
| Session | `/c/[threadId]` | Sending from the landing morphs it into a session: composer docks to the bottom, the conversation is a centered column (Claude style, max-w-3xl), generative UI inline in the reply; a card can expand to a full-width sheet. Thread rail on the left: collapsed to icons by default, expands (≡ or hover) into "แชทใหม่", search, sessions grouped วันนี้ / เมื่อวาน / 7 วัน / เก่ากว่า, rename/delete |
| Inbox drawer | `?inbox` (right drawer, from the bell) | One drawer for everything that arrived: handoffs (accept / need info / return / open in my agent), alerts (hypothesis, verify, dismiss), replies. Each item is also a card the agent can show inline in chat |
| Dashboard | `/dashboard` (and ⌘D from home) | The pinned + suggested cards at full size, with pin/unpin/reorder, "ทำไมถึงเห็นอันนี้", and the suggested tray; visually the same cards as the landing backdrop |
| Account sheet | avatar → sheet | Memory (what Cop remembers, delete), theme, persona switch (demo), and — for `it_admin` only — the admin console link |
| Admin console | `/admin` | RBAC + metric ACL matrix, tool kill-switch, audit, usage, "view as role" simulator. Deliberately plain; it is the only admin-looking page and only IT sees it |

Plus `/login` (persona picker on the same dark glow background) and `/outbox` (what would have been emailed; linked from the admin console).

Decisions that every package respects:

| # | Decision | Why |
|---|---|---|
| D1 | **Permission is code, not prompt.** `AccessContext` is derived server-side from the session cookie; tools are filtered per role before `createVexaHandler` sees them; every semantic query gets scope predicates injected; masked fields come back as `"***"` with a `masked: [...]` list | The LLM can be talked out of anything; the query layer cannot |
| D2 | **Numbers come from the semantic layer only.** One tool `query_metric` over a metric registry; no free SQL, no arithmetic by the model | "Sales and Finance disagree on the number" kills the project; certified metrics fix it |
| D3 | **Dashboard is stable.** Pinned widgets never move by themselves; auto-compose only fills the Suggested tray and each suggestion shows its reason | A dashboard that changes overnight destroys trust |
| D4 | **Forecast, anomaly, recommender are deterministic.** The LLM explains and proposes after detection, never detects | Reproducible, testable, cheap |
| D5 | **Handoff packets carry references, not values.** The recipient's agent re-runs the queries under the recipient's scope | No data leak across departments through a forwarded chart |
| D6 | **Outbound actions are approval-gated.** `create_handoff`, `send_email`, `pin_widget` run through Vexa approval cards (`needsApproval`) | Human in the loop |
| D7 | **Runs without a key.** Every demo scenario has a scripted mock turn (`vexa/mock`); a real model (Anthropic) is used when `ANTHROPIC_API_KEY` is set | Demo anywhere, tests without cost |
| D8 | **Mock data is generated, not hand-written.** A seeded deterministic generator produces 18 months of daily data across sales, supply, marketing, finance, HR with injected anomalies; `.data/` holds only user-state (threads, memory, packets), never business data | Realistic volume, reproducible, one place to tune |

## 2. Architecture

```
Browser (Next.js App Router, Vexa react/chat, Tailwind v4, Vexa tokens)
  │  cookie: cop_session=<userId>          (demo auth; swap for SSO later)
  ▼
app/api/chat/route.ts
  → lib/server/session.ts      AccessContext { userId, roles, scopes, metricAcl, toolAllow }
  → lib/server/request-context.ts   AsyncLocalStorage<AccessContext> (tools read it, never the client)
  → lib/server/agent/handler.ts     createVexaHandler per role (memoized): persona(user) + tools(role) + rules
       tools: query_metric · list_metrics · describe_entity · get_alerts · get_forecast
              resolve_owner · create_handoff(approval) · send_email(approval) · pin_widget(approval)
              recall_memory
  → lib/semantic/*              metric registry (owner, certified, dims, aclDims, synonyms th/en, unit)
  → lib/data/*                  generator + query engine (typed arrays, deterministic, scope predicates)
  → lib/server/store/*          JSON file store in .data/ (threads, memory, packets, widgets, events, audit)

Batch plane (no LLM in the loop; run on boot + `POST /api/jobs/run`):
  lib/engine/anomaly.ts   rolling z-score on residuals after weekly+yearly seasonality, level-shift (CUSUM)
  lib/engine/forecast.ts  Holt-Winters additive on weekly data, MAPE tracked
  lib/engine/recommend.ts quick-action scoring: freq × recency decay × context × role-peer lift − dismiss
  lib/engine/compose.ts   dashboard composer: clusters intents from action_events → WidgetSpec candidates
                          (LLM turns a cluster into a title/reason when a key is set; template otherwise)
  lib/engine/memory.ts    fact extraction after each turn (LLM structured output; rule-based fallback)
```

Vexa pieces used as-is: `VexaProvider`, `VexaChat` (page layout), `SpecView` (dashboard widgets and inbox previews), `createVexaHandler`, `createScriptedModel`, catalog (Card, Grid, Metric, BarChart, LineChart, Table, Alert, Callout, KeyValue, Timeline, Badge, Button + `runTool`), `fenceAsData`.

## 3. Wiring Vexa (phase 0 proves this)

Cop lives in `/Users/sbpdigital/Development/Cop` as its own repo; Vexa in `/Users/sbpdigital/Development/agentic-ui`. Preferred wiring, in order; stop at the first that boots the mock chat and passes typecheck:

1. `package.json` dependency `"vexa": "file:../agentic-ui"`, `next.config.ts` `transpilePackages: ["vexa"]`, tsconfig `paths` `"vexa/*": ["./node_modules/vexa/src/*"]` mirrors. Check `node_modules/vexa/src` exists after `bun install` and that `react` resolves once (`bun pm ls react`, no nested copy under `node_modules/vexa`).
2. Fallback: tsconfig `paths` pointing at `../agentic-ui/src/*` exactly like `examples/starter-next/tsconfig.json`, `next.config.ts` `outputFileTracingRoot` two levels up plus a webpack/turbopack `resolveAlias` for `react`, `react-dom`, `ai`, `@ai-sdk/react` to Cop's copies so there is one React.
3. Last resort: register Cop as `examples/cop` in the Vexa workspace and symlink it into `Cop/` (note it in this file if taken).

**Chosen: option 2** (phase 0, 2026-09-22). Option 1 failed: Bun 1.4 installs a `file:` dependency as a tree of per-file absolute symlinks into `../agentic-ui` (plus its whole `.bun` store), so every resolver follows the real path — TypeScript loaded a second `ai` from `agentic-ui/node_modules` (`Tool` type mismatch on `tools: { ping }`) and Turbopack refused the package outright ("Invalid symlink", targets outside the project root). What works:

- `tsconfig.json` `paths`: every `vexa/*` entry → `../agentic-ui/src/*` (copied from `examples/starter-next`), plus `ai` → `./node_modules/ai`, `ai/test` → `./node_modules/ai/dist/test/index.d.ts`, `@ai-sdk/react` → `./node_modules/@ai-sdk/react`. No `vexa` entry in `package.json`; no `transpilePackages`.
- `next.config.ts`: `outputFileTracingRoot: path.join(appDir, "..")` (lets Turbopack read `../agentic-ui`) and `turbopack.resolveAlias` `{ ai: "./node_modules/ai", "ai/test": "./node_modules/ai/dist/test/index.mjs", "@ai-sdk/react": "./node_modules/@ai-sdk/react" }`. Alias values must be project-relative (an absolute path is read as `./Users/...`), and `ai/test` needs its own entry because the `ai` alias prefix-matches the subpath into the `test.d.ts` stub (symptom: `MockLanguageModelV3 is not a constructor`). React needs no alias: the App Router already rewrites every `react` / `react-dom` import, from both trees, to Next's vendored copy (verified: no `agentic-ui/node_modules/.bun/react@` chunk is served; only `lucide-react` is bundled twice, harmless).
- `app/globals.css`: `@import "../../agentic-ui/src/styles.css";` — Tailwind resolves `tw-animate-css`, `streamdown/styles.css` and the `@source` globs relative to that file, i.e. from `agentic-ui/node_modules`.
- Versions: `ai`, `@ai-sdk/react` and `zod` in `package.json` are pinned to exactly what `../agentic-ui/node_modules` resolves (6.0.280 / 3.0.283 / 4.6.2). TypeScript dedupes a package only on an identical version, so a newer `ai` or `zod` in Cop makes `../agentic-ui/src/core/mcp.ts` fail with "type instantiation is excessively deep". After a Vexa dependency bump, re-pin here.

Model registry (`lib/server/models.ts`): `mock` (always, `createScriptedModel(COP_SCRIPT)`), `claude-sonnet-5` and `claude-haiku-4-5-20251001` through `@ai-sdk/anthropic` when `ANTHROPIC_API_KEY` is set; Sonnet is the default when present. `.env.example` lists `ANTHROPIC_API_KEY` only.

Port 3100. `globals.css` = `@import "tailwindcss"; @import "../../agentic-ui/src/styles.css";`. `<html lang="th" class="vexa-scrollbar">`. Fonts: `Noto Sans Thai` + `Inter` from Google Fonts via `next/font`.

## 4. Contracts (phase 0 writes these; every later package builds against them)

All in `lib/contracts/`. Types only, plus zod schemas where a value crosses the wire. No implementation.

```ts
// identity.ts
export type RoleId = "ceo" | "cfo" | "sales_director" | "sales_rsm" | "sales_rep" | "marketing_lead"
  | "supply_planner" | "finance_analyst" | "hr_manager" | "it_admin";
export type Region = "bkk" | "central" | "north" | "northeast" | "east" | "south";
export type Brand = "singha" | "leo" | "singha_soda" | "singha_water" | "purra" | "singha_lemon_soda" | "asahi" | "carlsberg";
export type BusinessUnit = "beer" | "non_alcohol" | "import";
export type User = { id: string; name: string; nameTh: string; title: string; role: RoleId; department: string;
  region: Region | null; managerId: string | null; email: string; lineId: string | null; avatarSeed: string };
export type AccessContext = { userId: string; role: RoleId; regions: Region[] | "all"; brands: Brand[] | "all";
  metricAcl: Record<MetricId, "full" | "masked" | "none">; toolAllow: string[]; canActAs: string[] };

// semantic.ts
export type MetricId = "net_sales_volume" | "net_sales_value" | "sell_out_volume" | "target_attainment"
  | "stock_on_hand" | "days_of_cover" | "production_output" | "capacity_utilization" | "forecast_mape"
  | "campaign_spend" | "campaign_reach" | "campaign_uplift" | "share_of_voice" | "sentiment_score"
  | "gross_margin" | "trade_spend" | "ar_overdue" | "headcount" | "attrition_rate" | "avg_salary";
export type Dim = "date" | "week" | "month" | "region" | "province" | "channel" | "brand" | "sku" | "pack"
  | "agent" | "dc" | "plant" | "campaign" | "department" | "business_unit";
export type Grain = "day" | "week" | "month";
export type MetricDef = { id: MetricId; label: string; labelTh: string; unit: string; format: "number" | "currency" | "percent";
  owner: string; certified: boolean; dims: Dim[]; aclDims: Dim[]; synonyms: string[]; description: string; sourceSystem: string };
export type MetricQuery = { metric: MetricId; dims: Dim[]; filters: Partial<Record<Dim, string[]>>;
  range: { from: string; to: string }; grain: Grain; compare: "none" | "prev_period" | "prev_year" | "target"; limit: number | null };
export type MetricRow = Record<string, string | number | null>;
export type Provenance = { metric: MetricId; certified: boolean; sourceSystem: string; asOf: string; rowCount: number;
  filtersApplied: Partial<Record<Dim, string[]>>; scopeApplied: Partial<Record<Dim, string[]>>; masked: string[]; trust: "verified" | "derived" | "estimated" };
export type MetricResult = { ok: true; rows: MetricRow[]; summary: string; provenance: Provenance } | { ok: false; error: string; code: "PERMISSION_DENIED" | "UNKNOWN_METRIC" | "BAD_QUERY" };

// dashboard.ts
export type WidgetKind = "metric" | "bar" | "line" | "table" | "alert_list" | "kv";
export type WidgetSpec = { id: string; userId: string; title: string; kind: WidgetKind; query: MetricQuery;
  pinned: boolean; position: number; source: "role_template" | "user_pin" | "ai_suggested"; reason: string | null;
  createdAt: string; version: number };
export type DashboardLayout = { userId: string; version: number; widgets: WidgetSpec[]; updatedAt: string };

// events.ts   (the behaviour log the recommender and composer read)
export type ActionEvent = { id: string; userId: string; at: string; kind: "question" | "quick_action" | "pin" | "dismiss" | "handoff" | "alert_open" | "widget_view";
  intentKey: string; metric: MetricId | null; dims: Dim[]; prompt: string | null; threadId: string | null };
export type QuickAction = { id: string; label: string; prompt: string; score: number; reason: string; intentKey: string };

// threads.ts
export type Thread = { id: string; userId: string; title: string; createdAt: string; updatedAt: string;
  messages: unknown[] /* VexaMessage[] */; preload: HandoffPreload | null };
export type HandoffPreload = { packetId: string; systemNote: string };

// memory.ts
export type MemoryFact = { id: string; userId: string; type: "interest" | "vocabulary" | "responsibility" | "preference" | "seasonal";
  value: string; confidence: number; sourceThreadId: string | null; createdAt: string; decayAt: string | null };

// handoff.ts
export type ContextPacket = { id: string; fromUserId: string; toUserId: string; title: string; ask: string;
  urgency: "low" | "medium" | "high"; sla: string | null; evidence: MetricQuery[]; alertIds: string[];
  conversationDigest: string; suggestedActions: string[]; status: "open" | "accepted" | "need_info" | "returned" | "resolved";
  outcome: string | null; thread: PacketReply[]; createdAt: string; updatedAt: string };
export type PacketReply = { userId: string; at: string; text: string };
export type Notification = { id: string; userId: string; at: string; kind: "handoff" | "alert" | "reply"; refId: string; read: boolean; title: string };

// alerts.ts
export type Alert = { id: string; at: string; severity: "P1" | "P2" | "P3"; metric: MetricId; dims: Partial<Record<Dim, string>>;
  window: { from: string; to: string }; observed: number; expected: number; zScore: number; direction: "up" | "down";
  hypothesis: string; verifySteps: [string, string]; ownerUserId: string; status: "open" | "dismissed" | "handed_off" | "resolved"; dismissCount: number };
export type Forecast = { metric: MetricId; dims: Partial<Record<Dim, string>>; horizon: { from: string; to: string };
  points: { date: string; value: number; lo: number; hi: number }[]; mape: number; method: "holt_winters" };

// audit.ts
export type AuditEntry = { id: string; at: string; userId: string; tool: string; argsHash: string; decision: "allow" | "deny" | "masked";
  rowsReturned: number; latencyMs: number };
```

Phase 0 also writes `lib/contracts/tools.ts`: the **tool surface** (names, zod input schemas, tier, which roles) so packages 1B, 2C, 3B agree:

| Tool | Tier | Roles | Input |
|---|---|---|---|
| `query_metric` | read | all | `MetricQuery` (zod) |
| `list_metrics` | read | all | `{ search: string \| null }` |
| `describe_entity` | read | all | `{ kind: "agent" \| "sku" \| "dc" \| "campaign" \| "user"; query: string }` |
| `get_alerts` | read | all | `{ status: "open" \| "all"; limit: number \| null }` |
| `get_forecast` | read | all | `{ metric, dims, weeks: number }` |
| `recall_memory` | read | all | `{ query: string }` |
| `resolve_owner` | read | all | `{ metric, dims }` → user + why |
| `create_handoff` | write (approval) | all except sales_rep | `{ toUserId, title, ask, urgency, evidence: MetricQuery[], alertIds }` |
| `send_email` | write (approval) | all except sales_rep | `{ toUserId, subject, body }` |
| `pin_widget` | write (approval) | all | `{ title, kind, query }` |
| `run_job` | destructive | it_admin | `{ job: "anomaly" \| "forecast" \| "compose" }` |

## 5. Mock data — the full lifecycle of a beverage company

`lib/data/` — generator seeded with `mulberry32(20260922)`. Dates: **2025-04-01 → 2026-09-22** (today), daily. All names, numbers and events are fictional.

### 5.1 Entities (`lib/data/entities/*.ts`, hand-written tables, small)

- **Org**: 3 business units; 6 regions; 24 provinces (4 per region); ~26 users (`entities/users.ts`) covering every `RoleId` with Thai names, titles, managers. Named personas used in scenarios: คุณธนา (CEO), คุณศิริพร (CFO), คุณอนุชา (RSM Northeast), คุณเบญ (Brand Marketing, non-alcohol), คุณวีร์ (Supply planner), คุณพิม (Trade marketing NE), คุณต้น (IT admin).
- **Products** (`entities/products.ts`): 8 brands × packs → ~30 SKUs. Packs: bottle 620 / bottle 320 / can 320 / can 490 / keg 30L / PET 600 / PET 1.5L / 12-pack. Fields: id, brand, pack, nameTh, hl per case, price per case, excise flag.
- **Channels**: on_premise, modern_trade, traditional_trade, export. Key accounts for modern trade: 5 fictional chains ("ซีสโตร์", "โลตัสมาร์ท", ... — never a real retailer name).
- **Agents** (distributors, `entities/agents.ts`): 40, Thai names (e.g., "ส.รุ่งเรือง เทรดดิ้ง"), province, tier (A/B/C), credit days, since year, weight.
- **Supply**: 3 plants (ปทุมธานี, ขอนแก่น, สิงห์บุรี; capacity in HL/day per line), 8 DCs (one per region + 2 extra), 6 raw materials with lead time.
- **Marketing**: 8 campaigns across the period (Songkran 2025/2026, ลอยกระทง, year-end, Leo music, Purra north clean-air, Singha Soda summer), each with spend, dates, brands, regions. Competitors anonymised as "คู่แข่ง A/B/C".
- **Finance**: monthly budget per BU; trade-spend budget per region; AR terms per agent.
- **HR**: departments with headcount ranges; `avg_salary` metric exists to prove masking.
- **Calendar** (`entities/calendar.ts`): Thai holidays 2025–2026, Songkran window, Buddhist Lent (เข้าพรรษา 2025-07-11 → 2025-10-07, 2026-06-30 → 2026-09-26), fiscal year = calendar year, Buddhist year helper.
- **External**: daily PM2.5 index for northern provinces (Jan–Apr high), temperature curve.

### 5.2 Facts (computed, cached as typed arrays on first access)

Deterministic function `volume(sku, agent, date)` = base(sku) × agentWeight × regionMix(brand, region) × seasonality(brand, date) × dow(date) × promoUplift(campaigns, date, brand, region) × lentDip(beer) × noise(hash) × anomaly(sku, agent, date). Sell-out = sell-in lagged 3–10 days with smoothing. Value = volume × price. Targets = last year same month × 1.06 rounded.

Inventory per DC × SKU per day = opening + inbound(production allocation) − outbound(sell-in of agents served by that DC); production per plant × day from a schedule that follows forecast demand with capacity caps; `days_of_cover` = stock / avg outbound(28d).

Marketing daily: reach and sentiment (−1..1) per campaign with noise; share-of-voice per brand per week.

Finance monthly: revenue from sales value; COGS 58–66% by BU; excise on beer; trade spend from campaigns + 3% baseline; gross margin; EBITDA; AR overdue per agent (credit days + tier-driven lateness).

HR monthly: headcount per department with slow growth; attrition 0.8–1.6%/month; avg salary (masked for everyone except hr_manager and ceo).

### 5.3 Injected anomalies (`lib/data/anomalies.ts`, the engine must find these and the scenarios rely on them)

1. Agent "ส.รุ่งเรือง เทรดดิ้ง" (บุรีรัมย์): Leo 620 sell-in −34% for 3 weeks ending today while sell-out flat → stock piling at agent.
2. Purra PET 600 sell-out +28% in เชียงใหม่/ลำพูน for the last 5 days, correlated with a PM2.5 spike.
3. DC ลำพูน days-of-cover for Purra 600 = 6.2 (threshold 10).
4. Two agents in Northeast stopped ordering 12 days ago (Leo, Singha) → region −12% WoW.
5. Modern-trade chain "ซีสโตร์" Singha Soda can 320 +40% after a promotion (not an error; the engine should label it "explained by promotion").
6. AR overdue jump for 3 tier-C agents in South.
7. Plant ขอนแก่น line 2 output −20% for 4 days (maintenance).

### 5.4 Query engine (`lib/data/query.ts`)

`runMetric(query: MetricQuery, access: AccessContext): MetricResult` — validates dims against the metric def, injects scope predicates from `access` (regions/brands), applies acl (`masked` → `"***"`), aggregates by grain and dims, applies `compare`, caps rows at `limit ?? 60`, returns `summary` (one Thai sentence with the top numbers) and `provenance`. Target: < 50 ms per query on the cached arrays; `bun test` covers scope injection, masking, compare, and each injected anomaly being visible in the raw numbers.

## 6. Phases and work packages

Every package: `bun run typecheck`, `bun run test`, curl of the page it changed, checkboxes ticked here. Agents work in parallel inside a phase; a phase starts when the previous one is merged.

### Phase 0 — foundation (one agent, sequential)

- [x] Scaffold Next.js 15 App Router in `Cop/` with Bun, Tailwind v4, Vexa wired per §3; `bun run dev` serves `/login` on 3100.
- [x] `lib/contracts/*` exactly as §4 (types + zod for `MetricQuery`, tool inputs, `WidgetSpec`, `ContextPacket`).
- [x] Demo auth: `entities/users.ts` (all 26 users), `/login` grid of persona cards, `POST /api/session` sets `cop_session`, `lib/server/session.ts` → `AccessContext` from `lib/access/policies.ts` (role → regions/brands/metricAcl/toolAllow table). Middleware redirects unauthenticated routes to `/login`.
- [x] `lib/server/store/json-store.ts`: typed collections in `.data/<name>.json`, in-memory + write-through, `bun run seed` resets user state.
- [x] `lib/server/request-context.ts` (AsyncLocalStorage) and `app/api/chat/route.ts` running a placeholder handler (persona + mock model + one `ping` tool) inside it.
- [x] `lib/i18n/th.ts` with the shell strings; app shell: sidebar (แดชบอร์ด, แชท, กล่องงาน, การแจ้งเตือน, ความจำ, ผู้ดูแลระบบ), top bar with persona switcher and bell, empty pages for every route.
- [x] `docs/plan.md` §3 updated with the wiring that worked; `README.md` with run steps.

### Phase 1 — data, access, shell (three agents in parallel)

**1A Data + semantic layer** (`lib/data`, `lib/semantic`)
- [x] Entities per §5.1, generator per §5.2, anomalies per §5.3, query engine per §5.4.
- [x] `lib/semantic/metrics.ts`: every `MetricId` with owner, certified, dims, aclDims, synonyms (Thai + English, incl. "เอเย่นต์", "ซับเอเย่นต์", "ลัง", "โหล", "เฮกโตลิตร"), unit, format, description; `findMetric(text)` synonym lookup.
- [x] `lib/semantic/dictionary.ts`: entity alias resolver (agent names with spelling variants, province aliases, brand nicknames "เบียร์สิงห์", "ลีโอ").
- [x] Tests: determinism (same seed → same totals), scope injection, masking, compare modes, 7 anomalies visible.
- [x] `scripts/inspect-data.ts` prints monthly volume by brand as a sanity table.

**1B Access + agent tools + handler** (`lib/access`, `lib/server/agent`)
- [x] `lib/access/policies.ts` full table for 10 roles; `lib/access/enforce.ts` (`toolsFor(access)`, `assertTool`, `scopePredicates`); audit log writer (`AuditEntry`) around every tool execute.
- [x] Tools per §4 table on top of 1A's `runMetric` (build against the contract; until 1A lands, a tiny in-memory stub behind `lib/server/agent/data-port.ts` — `stubDataPort` — that 1A replaces through `registerDataPort`).
- [x] `lib/server/agent/persona.ts`: persona per user (name, role, region, today in both ค.ศ. and พ.ศ., responsibilities, vocabulary rules, "answer in Thai", UI rules: Metric/Grid for KPIs, BarChart horizontal for comparisons, LineChart for trends, Table ≤ 10 rows, Alert for anomalies, a provenance line under every data card: `แหล่งข้อมูล · certified/derived · ณ วันที่`), memory facts fenced under "สิ่งที่จำได้เกี่ยวกับผู้ใช้", handoff preload fenced under "งานที่ส่งต่อมา".
- [x] `lib/server/agent/handler.ts`: `handlerFor(role)` memoized `createVexaHandler` with `tools: toolsFor(role)`, `toolTiers`, `stopWhen: stepCountIs(6)`, rules from §7; route wraps in `requestContext.run(access, …)`.
- [x] Tests: viewer role cannot see `avg_salary` (masked), sales_rsm NE cannot query region south (`PERMISSION_DENIED`), tool list per role matches the table, audit entry written per call.

**1C Chat-first app shell + pages** (`app/`, `components/`, `lib/dashboard`, `lib/i18n`, `lib/server/{dashboard,quick-actions,threads-read}.ts`)
- [x] Visual foundation from the Vexa website: read `agentic-ui/website/app/app.css` (blob/drift/shimmer keyframes, display font) and `website/app/components/hero-section.tsx` (GradientBlobs, gradient text, glass pill); port the keyframes into `app/globals.css`, dark-first (`class="dark"` default, toggle persisted), fonts Noto Sans Thai + Inter (+ Bricolage Grotesque for display if cheap).
- [x] Landing `/`: backdrop layer = pinned dashboard cards (from `lib/server/dashboard.ts`, rendered with `SpecView`, `pointer-events-none`, blurred/dimmed with a radial mask); foreground = greeting (gradient text, Thai, time-of-day aware), Cop's opening line (from `morningBrief(access)`), composer (large, rounded-2xl, gradient border glow, ⌘K focus), quick-action chips from `GET /api/quick-actions`, ambient cards row. "ดูแดชบอร์ด" button + ⌘D toggles the backdrop to the front (full opacity, interactive) without navigation.
- [x] Session `/c/[threadId]`: `VexaChat layout="page"` restyled through `labels`/props to fit the column; a new thread is created client-side on first send (`POST /api/threads` returns the id, router replaces the URL); `?prompt=` and `?preload=<packetId>` seed the first message/banner. Thread rail component with the grouping, search, rename, delete (store reads via `lib/server/threads-read.ts`; 2A owns persistence of messages and may extend this file).
- [x] Inbox drawer (bell → right drawer, URL `?inbox`): handoffs / alerts / replies tabs with the actions described in §1; item detail expands in place; "เปิดในเอเจนต์ของฉัน" → `/c/new?preload=<id>`.
- [x] `/dashboard`: the same cards at full size with pin/unpin/reorder, suggested tray accept/dismiss, "ทำไมถึงเห็นอันนี้" hover-card, versioned layout; role templates in `lib/dashboard/templates.ts`, `widget-to-spec.ts` for every `WidgetKind` (+ masked/denied variants), `lib/server/dashboard.ts` with `layoutFor(access)` and a placeholder `resolveWidget` the orchestrator swaps for the engine.
- [x] Account sheet (avatar): memory list with delete, theme toggle, persona switch, admin link for it_admin. `/admin` plain tabs (ผู้ใช้และสิทธิ์, เครื่องมือ + kill switch, Audit, การใช้งาน, จำลองมุมมอง). `/outbox` list. `/login` persona grid on the glow background.
- [x] Motion: landing → session morph (composer docks, cards fade), chips hover lift, cards `hero-rise` on mount; respect `prefers-reduced-motion`. 375 px pass, no horizontal scroll, keyboard focus.
- [x] `lib/i18n/th.ts` strings, `lib/i18n/format.ts` helpers; curl checks for `/`, `/login`, `/dashboard`, `/c/<id>`, `/admin`, `/outbox`.

### Phase 1.5 — UI polish after the user's review (one opus agent)

User decisions from the review of 2026-09-22 (evening): **light theme is the default**; the look should follow QwenCloud (qwencloud.com pricing + Try AI pages): page bg `rgb(249,250,253)`, text `rgb(11,12,15)`, Inter + Noto Sans Thai, display h1 ~60px/600/-1.2px, black pill primary button, white pill chips with a 1px inset border `rgb(230,233,239)` radius 24px, one gradient accent phrase (indigo→violet→coral) in an otherwise near-black headline, soft pastel blobs, white cards with 1px border + very soft shadow, generous whitespace. Dark stays available from the account sheet.

- [ ] Light default (`<html>` without `dark`, boot script default light, toggle persists); light palette tuned to the values above; gradient text only on the name in the greeting.
- [ ] Landing backdrop in light mode is a smear: reduce blur to ~2px, opacity ~0.35, white radial mask toward the centre, keep card edges crisp; a soft translucent white panel behind the greeting + composer so the column always has contrast.
- [ ] Composer (landing + session): white, 1px border, soft shadow, 2px gradient ring on focus, black round send button; chips as Qwen; ambient cards white with a coloured left accent.
- [ ] Dashboard mode (⌘D): cards fully crisp (no residual blur/opacity), content offset by the rail so the expanded rail never covers the first card; sticky top composer.
- [ ] Widgets: `BarChart horizontal` / `LineChart` instead of `Chart`; Thai short time labels; partial last bucket marked (dashed) or excluded.
- [ ] Bug: `/c/new?prompt=…` bounces to `/` instead of creating a thread and auto-sending; alerts' verify buttons depend on it.
- [ ] Session page, login, account sheet, inbox drawer, dashboard, admin: light pass with the same card/border/shadow language; drawer/sheet dim = `bg-foreground/10` + light backdrop-blur, not mush.
- [ ] Greeting: ตอนเช้า / ตอนบ่าย / ตอนเย็น / ค่ำ mapping; verify with the browser at 1440×900 and 375×812, screenshots into `docs/screenshots/` (light).

### Phase 2 — the four loops (four agents in parallel)

**2A Threads, memory, quick actions** (`lib/server/threads.ts`, `lib/engine/memory.ts`, `lib/engine/recommend.ts`)
- [ ] Vexa change (in agentic-ui, minimal, general): `VexaChatProps.initialMessages?: VexaMessage[]` and `id?: string` passed to `useChat`; scenario `thread-restore` in shop-admin per Vexa's CLAUDE.md; note in §9.
- [ ] Threads: create on first message, save through `onMessagesChange` (throttled) to `POST /api/threads/:id`, title from the first user message, list/switch/delete in the chat column; `?preload=<packetId>` creates a thread with `HandoffPreload`.
- [ ] Action events: every user message → `ActionEvent{kind:"question", intentKey}` where `intentKey` = `${metric}|${dims sorted}` from the tools the turn called (read from the saved messages), quick-action clicks → `quick_action`.
- [ ] Recommender: score = 0.35·freq(30d) + 0.25·e^(−Δt/14d) + 0.15·timeOfDayMatch + 0.15·rolePeerLift + 0.10·contextSimilarity(last turn's metric) − 0.5·dismissPenalty; top 4 + 2 seasonal (calendar-aware: pre-Songkran, month-end close, Lent); each carries `reason` shown on hover ("ถามบ่อยช่วงปิดเดือน"). `GET /api/quick-actions` re-fetched after every turn.
- [ ] Memory: after each completed turn, extract facts (LLM structured output with zod when a real model is chosen; rule-based when mock: metrics/dims asked, entities named); dedupe by `(type,value)`, decay 90 days; `/memory` lists and deletes; persona receives ≤ 1.5k tokens of the highest-confidence facts.
- [ ] Tests: recommender ordering, decay, memory dedupe, thread save/restore.

**2B Anomaly, forecast, alerts, briefing** (`lib/engine/anomaly.ts`, `lib/engine/forecast.ts`, `lib/server/alerts.ts`)
- [ ] Anomaly: for each (metric ∈ sell_out_volume, net_sales_volume, days_of_cover, production_output, ar_overdue) × watched dims, residual after weekly (dow means) + yearly (same-week last year) seasonality, rolling 56-day z-score, CUSUM level-shift; severity P1 ≥ 3σ or stock-out risk, P2 ≥ 2σ, P3 else; dedupe by root (agent → region roll-up keeps the deeper one); promotion-explained flag using the campaign table.
- [ ] Hypothesis + two verify steps per alert from templates keyed on metric/direction/context (sell-in down + sell-out flat → "สต๊อกค้างที่เอเย่นต์"; PM2.5 correlation r > 0.6 → "อากาศ/ฝุ่น"); owner from `resolve_owner` (RACI table in `lib/access/raci.ts`: metric × region → role → user).
- [ ] Forecast: Holt-Winters additive (weekly seasonality, period 52 on weekly aggregates) for volume per brand × region and days-of-cover per DC × SKU; 8-week horizon with ±1.28σ band; MAPE from a 12-week backtest.
- [ ] Alerts page: list with severity filter, hypothesis, verify buttons (open chat with the verify prompt), dismiss (3 dismissals → threshold ×1.25 for that key, shown to the user), hand off (opens the handoff composer of 2C).
- [ ] Morning brief (`lib/server/briefing.ts`): per user, top 3 alerts in scope + target attainment + open packets, rendered as a Vexa spec on the dashboard; "what changed since yesterday" diff (metrics moved > threshold, alerts closed, packets replied).
- [ ] `POST /api/jobs/run` runs both engines; runs on first boot if `.data/alerts.json` is missing. Tests: all 7 injected anomalies detected with the right direction, promotion one flagged explained, MAPE < 15 % on the backtest.

**2C Handoff, inbox, notifications, outbox** (`lib/server/handoff.ts`, `app/inbox`)
- [ ] `create_handoff` tool → `ContextPacket` (evidence = the `MetricQuery`s the turn ran + alert ids, digest = last 3 turns summarised by template), `Notification` for the recipient, outbox entry (mock email with the packet link).
- [ ] Inbox card per packet: from/role, one-line ask, urgency, SLA, evidence rendered by re-running each query **under the recipient's access** (masked fields shown as "ถูกปิดตาม policy" with a request-access button), 3 actions: รับงาน / ขอข้อมูลเพิ่ม / ตีกลับ (with reason drafted from a template), reply thread, close requires an outcome.
- [ ] "เปิดในเอเจนต์ของฉัน": creates a thread with `HandoffPreload` (system note lists the packet, its evidence and suggested actions, fenced) and sends the first assistant turn automatically ("ผมดึงข้อมูลที่เกี่ยวข้องมาแล้ว…" using the tools).
- [ ] Reply from the recipient posts back into the sender's inbox thread and notification; the sender's original chat thread gets a system message linking the reply.
- [ ] `send_email` tool → outbox page shows the rendered email. `resolve_owner` suggests the recipient with a reason (RACI + "เคยรับงานลักษณะนี้ N ครั้ง" from packets + current open load).
- [ ] Tests: packet evidence re-resolved under recipient scope masks what the sender could see; packet lifecycle; notification created.

**2D Dashboard composer + widgets** (`lib/dashboard`, `lib/engine/compose.ts`, `app/page.tsx`)
- [ ] `widget-to-spec.ts`: each `WidgetKind` → Vexa `Spec` (Metric with trend from compare; BarChart horizontal; LineChart with forecast band as a second series when available; Table ≤ 8 rows; alert_list → Alert stack; kv → KeyValue) plus a provenance line and a "ทำไมถึงเห็นอันนี้" affordance.
- [ ] Role templates in `templates.ts` (CEO: national volume vs target, GM by BU, top alerts, AR overdue; RSM: region vs target by brand, top-10 falling agents, forecast; Marketing: campaign spend/reach/uplift, SoV, sentiment; Supply: days-of-cover heatmap-as-table, production vs plan, MAPE; Finance: budget vs actual, AR aging; HR: headcount/attrition).
- [ ] Layout store: pin / unpin / reorder / hide; `pin_widget` tool from chat (approval card) lands in Pinned; layout is versioned with "ดู layout เมื่อวาน" rollback.
- [ ] Composer (`compose.ts`): cluster `ActionEvent`s by `intentKey` (freq ≥ 3 in 14 days, not already pinned) → candidate `WidgetSpec` with `source: "ai_suggested"` and `reason` ("คุณถามคำถามนี้ 6 ครั้งใน 14 วัน"); with a real model the title is written by the LLM through structured output validated by zod, otherwise from the metric label; max 1 new suggestion per day per user; Suggested tray with accept/dismiss; promote-to-dashboard prompt in chat after the 3rd repeat of an intent.
- [ ] Polish found in the phase-1 review: widgets use `BarChart` (horizontal) and `LineChart` instead of the simple `Chart` (x-labels overlap); time keys rendered in Thai short form (`ส.ค. 26`, `สัปดาห์ 38`) not `2026-W38`; an incomplete last bucket (current week/month) is marked or excluded so the line does not "fall off"; the sell-in vs sell-out overlay widget for the agent anomaly.
- [ ] Tests: template per role renders valid specs (validate with Vexa's `normalizeSpec`), composer respects pinned/limit rules, layout versioning.

### Phase 3 — governance, demo script, QA (three agents in parallel)

**3A Admin console + red-team suite**
- [ ] `/admin`: users × roles table, metric ACL matrix (full/masked/none per role), tool matrix per role with kill-switch (persisted, enforced by `toolsFor`), audit log with filters, usage (questions/day, top intents, unanswerable questions from `ok:false` results, cost estimate from token usage), "จำลองมุมมอง" (run `runMetric` as another role and show what they would see, read-only).
- [ ] `tests/red-team.test.ts`: 60 cross-scope questions as direct tool calls per role (regions, brands, salary, other users' memory, packets addressed to others) → 0 leaks; aggregation test (min-cell suppression when a filtered result would expose ≤ 2 agents' salary/margin).

**3B Scripted demo (mock model) + demo guide**
- [ ] `lib/server/mock/script.ts`: `MockTurn`s for the three wow scenes and the persona day-in-the-life prompts (RSM: ยอดอีสานเทียบเป้า, top-10 เอเย่นต์ยอดตก, เทียบปีที่แล้ว, ส่งให้ Trade Marketing; Marketing: Purra spike, stock พอไหม, ส่งให้ Supply; Supply: open handoff, ทางเลือก 2 ทาง; CEO: ยอดรวมประเทศ, drill ภาค → เอเย่นต์, board prep). Each turn calls the real tools (`tool` steps with `then`) so the numbers are real generator output, and renders specs with the catalog.
- [ ] Quick-action defaults per role seeded so the chips work on first run; `docs/demo.md`: the 3-scene script, which persona to sign in as, what to click, expected screens.

**3C QA, polish, docs**
- [ ] Thai copy pass on every page; date formatting (พ.ศ. with `Intl` `th-TH-u-ca-buddhist` where the persona prefers it, ค.ศ. in data tables); number formatting (HL, ลัง, บาท, %).
- [ ] 375 px pass; dark mode pass; keyboard focus; empty states; loading skeletons on dashboard widgets.
- [ ] `README.md` (setup, personas, scenes, architecture map), `docs/architecture.md` (this plan's §2 as prose + the data model), CLAUDE.md commands verified.
- [ ] Full `bun run typecheck && bun run test`, curl of every route, `.data` reset with `bun run seed`.

## 7. Prompt rules (used by 1B, referenced by 3B)

Persona rules the handler passes as `rules` (Thai unless noted):

- ตอบเป็นภาษาไทย กระชับ 1–3 ประโยค แล้วให้ UI แสดงข้อมูล ห้ามพิมพ์ตัวเลขซ้ำใน markdown
- ทุกตัวเลขต้องมาจากผลลัพธ์ tool ในบทสนทนานี้ ถ้าไม่มีข้อมูล ให้บอกว่าไม่มี ห้ามประมาณเอง
- ก่อนเรียก `query_metric` ให้ยืนยันนิยามในใจ: ถ้าคำถามกำกวมระหว่าง metric (เช่น "ยอดขาย" = ปริมาณหรือมูลค่า) ให้เลือก certified metric ที่ตรงที่สุดและบอกผู้ใช้ในประโยคเดียวว่าใช้ตัวไหน
- ใต้ทุก Card ที่มีข้อมูล ใส่ Text muted หนึ่งบรรทัด: `แหล่งข้อมูล: <sourceSystem> · <certified ? "รับรองแล้ว" : "คำนวณ"> · ณ <asOf>` (copy from provenance)
- ผลลัพธ์ที่มี `masked` ให้บอกว่า "มี N ฟิลด์ถูกปิดตามสิทธิ์" และเสนอปุ่ม ขอสิทธิ์ (runTool `send_email` ถึงเจ้าของ metric) ห้ามเดาค่าที่ถูกปิด
- `PERMISSION_DENIED` = ตอบว่าข้อมูลนี้อยู่นอกขอบเขตของผู้ใช้ และเสนอส่งเรื่องให้ผู้รับผิดชอบผ่าน `resolve_owner`
- เมื่อพบความผิดปกติ (จาก `get_alerts` หรือจากตัวเลข) ให้เสนอสมมติฐาน 1 ข้อ + วิธีตรวจ 2 ทาง + ถามว่าจะส่งต่อให้ผู้รับผิดชอบไหม (ปุ่ม runTool `create_handoff`)
- ถ้าผู้ใช้ถามเรื่องเดิมซ้ำ (ระบบจะบอกใน host context `repeatCount`) ให้เสนอปุ่ม "ปักเป็นการ์ดบนแดชบอร์ด" (runTool `pin_widget`) หนึ่งครั้ง
- Comparison → BarChart horizontal; trend ≥ 10 จุด → LineChart; ≤ 8 records → Table; 1 ตัวเลข → Metric; หลาย KPI → Grid columns 2–3 ของ Metric

## 8. Agent dispatch map

| Phase | Package | Model | Why this model | Notes for the prompt |
|---|---|---|---|---|
| 0 | foundation | fable (already running) | first package, proves the wiring | Reads Vexa CLAUDE.md + starter-next; proves §3 wiring first; writes contracts verbatim from §4 |
| 1 | 1A data | opus | algorithmic generator, numeric correctness, tests | Pure TS, tests first; no UI; performance budget |
| 1 | 1B access + tools | opus | security boundary, Vexa handler internals | Builds on contracts + stub; reads Vexa `core/handler.ts`, `core/prompt.ts`, shop-admin `chat-handler.ts` |
| 1 | 1C shell | opus | UI quality matters to the user (user asked for opus on UI) | Reads Vexa `DESIGN.md`, `styles.css`, `chat/vexa-chat.tsx`, `react/spec-view.tsx` |
| 2 | 2A threads/memory/quick actions | sonnet (UI parts opus) | CRUD + scoring formula given in the plan | Vexa change (initialMessages) needs a scenario in agentic-ui |
| 2 | 2B anomaly/forecast | opus | statistics, must find all 7 injected anomalies | Tests against §5.3 |
| 2 | 2C handoff/inbox | opus | workflow + pages, contracts fixed | Re-resolution under recipient scope is the one hard rule |
| 2 | 2D dashboard composer | opus | spec builders + templates | Validate specs with Vexa `normalizeSpec` |
| 3 | 3A admin + red-team | opus | permission audit, adversarial tests | 60-question suite, 0 leaks |
| 3 | 3B scripted demo | sonnet | mock turns from real tool output | Needs 1A numbers |
| 3 | 3C QA/polish/docs | sonnet (haiku for README/copy sweeps) | breadth over depth | Runs last inside the phase |

Model choice rule: opus for anything that guards data (access, red-team), needs numeric/statistical correctness, or is user-facing UI (the user wants opus on UI); sonnet for non-UI workflow/glue packages; haiku for mechanical sweeps (copy, formatting, curl checks, README). Never default to one model for everything.

Ownership rule for parallel agents: a package edits only the folders listed in its heading plus new files; shared files are append-only; no package changes `lib/contracts/*` (a needed change is proposed in its report and applied by the orchestrator between phases).

## 9. Changes to Vexa (agentic-ui) made for Cop

Vexa is not a constraint (user decision 2026-09-22): change it when Cop needs it, prefer general features, list them here. Candidates already identified: a pluggable catalog (`createVexaHandler({ catalog })` + `SpecView registry`) so Cop can add `Provenance`, `AnomalyCard`, `HandoffCard`, `Sparkline`, `Heatmap`; `VexaChat` `initialMessages`/`id`; a headless `useVexaChat` so Cop can own the chat chrome.

- [ ] `VexaChat` `initialMessages` / `id` props (phase 2A) — thread restore for any host.

## 10. Out of scope for this build

SSO/Entra, real databases, LINE push, mobile app, text-to-SQL, write-back to ERP, multi-tenant billing, Vexa canvas/chatless (roadmap phases 2–3 there; revisit when they land).

## 11. Risks

| Risk | Mitigation in this plan |
|---|---|
| Two React copies through the `file:` dependency | §3 fallback order, proven in phase 0 before anything else |
| Model copies numbers into props wrongly | tools return ≤ 60 pre-formatted rows; 3B mock turns use real tool output; eval later with Vexa's `eval:ui` pattern |
| Generator too slow or too big | typed arrays, cached per metric, budget 50 ms/query with a test |
| Dashboard feels unstable | D3: pinned immutable, 1 suggestion/day, reasons, rollback |
| Agents collide on shared files | §8 ownership rule; contracts frozen inside a phase |
