# Cop — build plan

## สถานะ (updated 2026-09-23)
ทำแล้ว: Phase 0–3 · 1.5–1.9 (Cop `5ef3363`, `d303add` บน `main`) · Vexa host catalog/approval/data-card (`d893818` บน `roadmap`) · โมเดลจริงตัวเดียว `google/gemini-3.8-flash` ผ่าน OpenRouter (`lib/server/models.ts`) · `eval:cards` 28/30 ×2 runs · Cop build ผ่าน · Vexa scenarios 39/43 (ที่ตกมีอยู่แล้วก่อนรอบนี้), `eval:ui` revenue-by-status/week-dashboard 4/5
ค้าง:
- working tree มีงาน Phase 1.9 ของ session cop-36 ยังไม่ commit (`app/(app)/page.tsx`, `app/api/threads/route.ts`, `landing.tsx`, `present.ts` `weakestRow`, `ambient.ts`, `dashboard.ts` `visitsFor`, `th.ts`, `lib/cards/weakest.test.ts` ใหม่) — ยังไม่ได้พิสูจน์: `bun run typecheck && bun run test` หลังการแก้ชุดนี้
- การ์ดของ persona CFO/HR/supply/sales_rep ยังไม่เคยเปิดดูด้วยตา (Claude in Chrome ปิดใน settings, profile ของ chrome-devtools ถูกอีก session ถือ) · `run_job` ของ it_admin พิสูจน์ด้วยเทสต์เท่านั้น
- ยังไม่ push ทั้งสอง repo · Vexa `roadmap` ยังไม่ merge · devtools toggle ของ Vexa โผล่ในแชทตอน dev
ค้นพบ:
- `get_forecast` ที่ไม่ระบุมิติเคยคืนชุดแบรนด์×ภาคแรกเป็น "ทั้งประเทศ" (3.9k vs จริง ~57k hl/สัปดาห์) — `lib/engine/forecast-slice.ts` รวมเฉพาะเมตริกที่บวกได้, `days_of_cover` ต้องระบุ dc+sku
- headline delta เคยเทียบทุกแถวกับ top-N หลัง limit (+171.9% vs จริง +8.4%) — แก้ใน `runMetric`; `compare:"target"` บน `target_attainment` ตอนนี้ = `none`
- กฎการ์ดของ host ต้องอยู่ใน `COP_RULES` ไม่ใช่ `SHARED_INTRO` ของ Vexa (ทำ `eval:ui` ของ shop-admin ตก 5/5→2/5) · `eval:ui --report` เขียนทับ `docs/admin-ui-eval.md` + `specs.ts` ของ Vexa
- Gemini 3.1 Flash Lite อ่อนเกินไป (ดึงข้อมูลแล้วตอบว่าไม่มีตัวเลข) · `.data` ถูกเขียนจากการใช้งานจริง เทสต์ห้ามถือว่าว่าง · `eval:cards` เขียน memory ผ่าน handler จริง
ถัดไป: /go ตรวจ การ์ด persona CFO/HR/supply/sales_rep + run_job ของ it_admin ในเบราว์เซอร์ และ typecheck/test ของงาน 1.9 ที่ยังไม่ commit ตาม docs/plan.md

Status: **In progress** · Revision 8 · 2026-09-23 · phases 0–3 and 1.6–1.9 committed in Cop; Vexa changes committed on `roadmap`.

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
| D7 | **Runs without a key.** Every demo scenario has a scripted mock turn (`vexa/mock`); a real model (Gemini 3.8 Flash via OpenRouter) is used when `OPENROUTER_API_KEY` is set | Demo anywhere, tests without cost |
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

Model registry (`lib/server/models.ts`): **one real model** — `google/gemini-3.8-flash` through OpenRouter (`@openrouter/ai-sdk-provider`) when `OPENROUTER_API_KEY` is set, overridable with `AGENT_MODEL` (user decision 2026-09-23: one model, Gemini) — then `mock` (always, `createScriptedModel(COP_SCRIPT)`). The Anthropic entries remain only for when `ANTHROPIC_API_KEY` is set.

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

- [x] Light default (`<html>` without `dark`, boot script default light, toggle persists); light palette tuned to the values above; gradient text only on the name in the greeting.
- [x] Landing backdrop in light mode is a smear: reduce blur to ~2px, opacity ~0.35, white radial mask toward the centre, keep card edges crisp; a soft translucent white panel behind the greeting + composer so the column always has contrast.
- [x] Composer (landing + session): white, 1px border, soft shadow, 2px gradient ring on focus, black round send button; chips as Qwen; ambient cards white with a coloured left accent.
- [x] Dashboard mode (⌘D): cards fully crisp (no residual blur/opacity), content offset by the rail so the expanded rail never covers the first card; sticky top composer.
- [x] Widgets: `BarChart horizontal` / `LineChart` instead of `Chart`; Thai short time labels; partial last bucket marked (dashed) or excluded.
- [x] Bug: `/c/new?prompt=…` bounces to `/` instead of creating a thread and auto-sending; alerts' verify buttons depend on it.
- [x] Session page, login, account sheet, inbox drawer, dashboard, admin: light pass with the same card/border/shadow language; drawer/sheet dim = `bg-foreground/10` + light backdrop-blur, not mush.
- [x] Greeting: ตอนเช้า / ตอนบ่าย / ตอนเย็น / ค่ำ mapping; verify with the browser at 1440×900 and 375×812, screenshots into `docs/screenshots/` (light).

### Phase 1.6 — decision-grade cards (light-first, user review of 2026-09-22 late evening)

User verdict on the cards: "ต้องดูแพงและข้อมูลจำเป็นตัดสินใจได้ง่าย ไม่เอาแต่ text เยอะ ๆ" and "เน้น light mode ก่อนเสมอ". What was wrong: every card dumped `result.summary` (a grounding sentence written for the model) into `Card.description`, so the answer was three lines of grey prose above the data; the provenance line repeated half of it; deltas were uncoloured text; the agent ranking was sorted by size, not by the decline it claimed to show; alert rows carried raw dim ids and no numbers; the national trend chart plotted a brand/region weekly forecast against national monthly actuals, and the null padding rendered as a crash to zero.

- [x] Semantic layer returns a structured `MetricHeadline` (`aggregate`, `value`, `periodLabel`, `rowCount`, `deltaPercent`, `compareLabel`, `top`) beside the text `summary`; `summarize` is now derived from it. Rows carry `value_label` (pre-formatted, the rule §4 already asked for).
- [x] One card shell everywhere: `Card.meta` = period + how many of what, `Card.footnote` = source · trust · asOf, `description` null. Body leads with `Metric size="lg"` (headline value + delta pill), then the rows or the chart.
- [x] `metric-display.ts` owns direction vs judgement: `directionOf` (arrow), `toneOf` (good/bad; `ar_overdue`, `attrition_rate`, `forecast_mape`, `trade_spend` are lower-is-better), `formatDelta`.
- [x] Rankings use `RankList` (rank, label, proportional bar, value, delta pill) instead of a two-column table or a horizontal bar chart; the "agents that dropped" card sorts by `delta_pct` ascending.
- [x] A percent `metric` widget adds a `Progress` bar with "เหลืออีก N% ถึงเป้า".
- [x] Alerts (dashboard, chat, landing, inbox) show Thai scope, `จริง X · คาด Y · ห่าง Z%` and a severity dot; `get_alerts` returns `scopeLabel` / `observedLabel` / `expectedLabel` / `gapLabel` so no consumer re-derives them.
- [x] Forecast overlay only attaches when the forecast's dims are pinned by the widget's filters and the grain is weekly; forecast series is dashed and padded with nulls (real gaps, not zeros).
- [x] Dashboard: masonry columns instead of a ragged grid, card actions inside the card on hover, "เปลี่ยนแปลงตั้งแต่เมื่อวาน" as delta chips (`changesSince` returns `DashboardChange[]`).
- [x] `COP_RULES` teach the real model the same shell (meta/footnote/hero, RankList, table align/tone, alert meta, lower-is-better tone).
- [x] Checked in the browser at 1440×900 in light mode: `/`, `/dashboard`, `/c/<id>` (ranking, alerts), `?inbox`; dark mode re-checked afterwards.

### Phase 1.7 — the model chooses, Cop draws (user decision 2026-09-23)

The user's question: "จะมั่นใจได้ไงว่า model จริงจะวาดสวยแบบที่คุณวาด … มันต้องมีวิธีคิดและหลักการสิ" plus "ควรมี next action suggestion ให้เสมอ". Phase 1.6 made the cards good but left their shape to the model's judgement at generation time, and nothing in the product ever offered to act — the chat asked the user to *type* "ส่งต่องานให้ผู้รับผิดชอบ". The principle: the model does the part that needs a model (understand the question, pick the data); Cop does the part with one right answer (draw the card, decide what to offer next). Three layers, chosen together with the user: a bound component, an eval, and a normalizer as the net.

- [x] **`lib/cards/present.ts`** — one decision table (`presentCard` / `presentAlerts`) shared by the dashboard (rendered as a Vexa spec) and the chat (rendered as React). `widget-to-spec.ts` is now a thin spec writer on top of it; `lib/cards/alert-row.ts` gives every surface the same pre-labelled `AlertRow`.
- [x] **`DataCard` / `AlertsCard` / `ActionStrip`** in Cop's own catalog (`lib/cards/catalog.ts`, via Vexa's new `extendCatalog`). The model writes `{ title, source: { $state: "/tools/query_metric" }, view, sortBy }` and nothing else; `components/cards/data-card.tsx` renders it through the presenter. The mock script now emits exactly that, so the demo proves the path.
- [x] **`lib/engine/next-actions.ts`** — deterministic rules, not model judgement: masked fields → ask the metric owner (`send_email`); an open alert or a drop worse than 5% → hand to the RACI owner (`create_handoff`); asked 2+ times → `pin_widget`; an alert → its first verify step; always a drill-in. Capped at three, filtered by `access.toolAllow`, never offered to yourself. `query_metric` and `get_alerts` return them in `nextActions`, so the buttons exist on the dashboard, in the chat and behind an approval card.
- [x] **`cop_action` host tool** — one button handler. A tool action becomes the `⟦action⟧ runTool` message the chat already understands (so the model still runs it behind Vexa's approval card); a question is simply asked. Works from the dashboard too, via `/c/new?prompt=`.
- [x] **Follow-up chips after every reply**, not only on an empty thread (`session-chat.tsx` registered its sender in `components/providers/chat-sender.ts`).
- [x] **Eval** — `bun run eval:cards -- --model=<id>` over `lib/eval/cases.ts` (15 questions × 5 personas) with deterministic checks in `lib/eval/check-cards.ts`: called a tool, used a bound card, sorted the way the question asked, title is an answer, no tool summary pasted as prose, every number traceable to a tool result. Writes `.eval-cards.json`. The scripted subset also runs in `bun run test` (`lib/eval/card-contract.test.ts`), so the contract is enforced with no API key.
- [x] **`lib/cards/normalize.ts`** — the net for a card the model still draws by hand: drops a description that only repeats a tool summary, fills `meta`/`footnote` from provenance, right-aligns number columns and colours signed-percentage ones. Prop rewrites only, never structural surgery. Wired through Vexa's new `VexaProvider normalizeSpec`.
- [x] **การขออนุมัติอ่านรู้เรื่อง** (จาก feedback ระหว่างทาง: "มันกาง json อะไรไม่รู้ให้ CEO เห็นทำไม" / "ไปอยู่ใน Thinking ทำไม" / "หลุด theme") — แก้ที่ค่าเริ่มต้นของ Vexa ไม่ใช่แค่ Cop: การ์ดอนุมัติย้ายออกมานอกบล็อก ProcessSteps ถาวร (ปิด Thinking แล้วยังกดอนุมัติได้), ไม่กางชื่อ tool และ input JSON อีก, `describeToolCall` ของ Cop เขียนเป็นประโยคไทย ("ส่งงานนี้ให้ คุณกนก ศรีสุวรรณ ใช่ไหมครับ" + เรื่อง/สิ่งที่ขอ/ความเร่งด่วน), รูปทรงและปุ่มเข้าชุดกับการ์ดข้อมูล
- [x] mock `handoffSteps` อ่าน input ที่ปุ่มส่งมาจริง แทนที่จะเล่นสคริปต์ชื่อคนอื่น เดโมเลยไม่ขัดกันเอง
- [x] รันกับโมเดลจริงแล้ว — `bun run eval:cards -- --model=google/gemini-3.8-flash --runs=2` ได้ 28/30 (สองเคสที่ตกเป็น false positive ของ checker ซึ่งแก้แล้ว)

### Phase 1.8 — การ์ดอนุมัติที่ CEO ตัดสินใจได้ และข้อความแชทที่บอกคำตอบ (user review 2026-09-23)

ผู้ใช้ลองใช้ระบบในมุม CEO แล้วสั่งว่า "ปรับ UI ข้อ Approve ให้สวยและ CEO ต้องตัดสินใจได้ง่าย … พวก Chat message ต้องลองดูหลาย ๆ case แล้วปรับ" ที่เห็นจริงบนหน้าจอ: การ์ดอนุมัติเป็นกล่องขาวเปล่า ๆ วาง label ซ้าย/ค่าชิดขวาจนตาต้องวิ่งข้ามจอ, โผล่ **ก่อน** ประโยคที่อธิบายเหตุผล, ฟองข้อความของปุ่มที่กดซ้ำเนื้อหาเดียวกันทั้งชุด, พออนุมัติแล้วเหลือกล่องสูงครึ่งจอที่เขียนแค่ "อนุมัติแล้ว" และประโยคนำของทุกคำตอบเป็นการบรรยายการ์ด ("ดูรายละเอียดในการ์ด") ไม่ใช่คำตอบ

- [x] **`components/cards/approval-card.tsx`** — การ์ดตัดสินใจของ Cop เอง ใช้ shell เดียวกับการ์ดข้อมูล: หัวการ์ดบอกว่า *ใคร* จะได้งาน (ชื่อ + ตำแหน่ง + ฝ่าย จาก `findUser`) พร้อมป้ายความเร่งด่วนตาม tone token, ตัวการ์ดบอก *เรื่อง* / *สิ่งที่ขอให้ช่วย* / *หลักฐานที่แนบไปด้วย* (ชื่อเมตริกและขอบเขตจริง ไม่ใช่จำนวนดิบ) และ *สิ่งที่จะเกิดขึ้นเมื่ออนุมัติ*, ท้ายการ์ดมีบรรทัด "ไม่มีอะไรเกิดขึ้นจนกว่าคุณจะกดอนุมัติ" คู่กับปุ่มสองปุ่ม ครบสี่ tool (`create_handoff` / `send_email` / `pin_widget` / `run_job`) ตอบแล้วยุบเป็นใบเสร็จบรรทัดเดียว (อนุมัติ = เครื่องหมายถูกโทน success, ไม่อนุมัติ = เงียบและเทา)
- [x] **ฟองข้อความของปุ่มเหลือประโยคเดียว** — `describe-tool.ts` ไม่ส่ง `details` อีก เพราะการ์ดที่ตามมาบอกครบแล้ว เดิมผู้ใช้อ่านเรื่อง/สิ่งที่ขอ/ความเร่งด่วนซ้ำสองรอบติดกัน
- [x] **ข้อความนำทุก case คำนวณจากผลลัพธ์ tool** (`lib/server/mock-script.ts`): ยอดขาย → ตัวเลขจริง + ภาคที่ห่างเป้ามากที่สุด, เอเย่นต์ → รายที่ตกแรงที่สุด, เงินเดือน → ขึ้นกับว่ามีฟิลด์ถูกปิดจริงไหม (เดิมบอกว่า "ถูกปิดตามสิทธิ์" ทั้งที่การ์ดโชว์ตัวเลขครบ), สต๊อก → ศูนย์ที่เหลือน้อยที่สุดเทียบเกณฑ์, พยากรณ์ → ทิศทางจากสัปดาห์แรกถึงสุดท้าย, บอร์ด → กลุ่มที่ฉุด + กำไรสูงสุด, ขายเข้า/ขายออก → จำนวนเอเย่นต์ที่กำลังระบายสต๊อก, ความผิดปกติ → จำนวนที่เปิดอยู่จริง (เดิมพูด "3 เรื่อง" ขณะที่การ์ดโชว์ 4 จาก 20) และบทสรุปที่ดูจากข้อมูลว่ากระจุกอยู่ภาคเดียวไหม; ถ้อยคำเลือกตามเครื่องหมายของ delta ("ฉุดมากที่สุด" เฉพาะตอนติดลบ)
- [x] **ปุ่มบนการ์ดทุกปุ่มมีปลายทาง** — mock เดิมรู้จักแค่ `create_handoff` ทำให้ปุ่ม "ปักเป็นการ์ดบนแดชบอร์ด" ตอบกลับด้วยข้อความ "ไม่มีสคริปต์"; `pressedSteps` รับ `⟦action⟧ runTool <tool>` ทุกตัวที่การ์ดเสนอได้
- [x] **หัวข้อสมมติฐานที่ซ้ำกันในการ์ดความผิดปกติถูกตัด** (`presentAlerts`) — สี่แถวเคยเขียนประโยคเดียวกันสองรอบ
- [x] `components/cards/approval-card.test.tsx` — ครอบทั้งสี่ tool ทั้งสถานะรออนุมัติ/อนุมัติแล้ว/ไม่อนุมัติ และเคส tool ที่ Cop ไม่รู้จัก (ต้องตกกลับไปการ์ดของ Vexa)
- [x] เห็นด้วยตาแล้ว: light + dark, คอลัมน์ 360px และ 1440px, เส้นทางจากการ์ดความผิดปกติ → ปุ่ม → การ์ดอนุมัติ → ใบเสร็จ

### Phase 1.9 — หน้าแรกที่บอกว่าวันนี้ต้องทำอะไร (user review 2026-09-23)

รีวิวหน้าแรกแล้วเจอว่า ประโยคใต้ชื่อเป็นแค่ "พบความผิดปกติที่ต้องดู 44 เรื่อง" ที่ดูน่าตกใจแต่กดไม่ได้ (เลขเดียวกันยังซ้ำในการ์ด "ภาพรวมของคุณวันนี้"), การ์ดสามใบข้างล่างเป็นข้อความล้วนและตัวเลขที่ใช้ตัดสินใจเป็นตัวเล็กสีจาง, backdrop ที่เบลอยังอ่านตัวเลขออกครึ่ง ๆ จนแย่งสายตา, พอกดส่งแผงทั้งแผงหายไปและไม่มี error และโหมด ⌘D ซ้ำกับ `/dashboard`

- [x] ใต้คำทักทายเป็นลิงก์สถานะ `รอคุณอยู่ ● วิกฤต N ● ควรดู N ● เฝ้าระวัง N ● งานที่ส่งมา N` แต่ละอันเปิดกล่องงานที่แท็บและระดับความรุนแรงนั้น (`?inbox=alerts&severity=P1`, `focusFromParams` ใน `components/inbox/drawer.tsx`) — `landingStatus` / `statusLinks`
- [x] การ์ดใต้ช่องพิมพ์ขึ้นด้วยตัวเลขก่อน (`lib/dashboard/ambient.ts`): ความผิดปกติ = ส่วนต่างมีเครื่องหมาย (−80%) สีตามความรุนแรง + จริง/คาด แล้วตามด้วยขอบเขต, งานที่ส่งมา = ป้ายความเร่งด่วน, ภาพรวม = ยอดเทียบเป้า 28 วัน + delta pill ของตัวเลขที่ขยับแรง (แทนการ์ดนับจำนวนเดิม) ใช้ `alertRowOf` แทนการคำนวณซ้ำ
- [x] ~~backdrop จางลง~~ → **ถอด backdrop แดชบอร์ดออกทั้งหมด** (ผู้ใช้ถาม "dashboard อยู่ด้านหลังจำเป็นไหม … กลัวไม่เห็นข้อมูลที่สำคัญ"): ภาพเบลอที่อ่านไม่ออกไม่ได้ช่วยให้ไม่พลาดอะไร แทนด้วย **แถบ KPI** (`landingKpis`) — ตัวเลขหลัก + delta ของการ์ดที่ปักไว้สูงสุด 4 ใบ ผ่าน `presentCard` ตัวเดียวกับแดชบอร์ด (การ์ดที่ถูก mask/ไม่มีสิทธิ์ถูกข้าม) กดแล้วไป `/dashboard`; การ์ดใต้ KPI เหลือ 2 ใบ (ความผิดปกติอันดับหนึ่ง + งานที่ส่งมา หรือความผิดปกติอันดับสอง) การ์ด "ภาพรวมวันนี้" ถูกแทนด้วยแถบ KPI; ลบ `components/dashboard/widget-cards.tsx` และ `.cop-mask-center` / `.cop-backdrop-dim` ที่ไม่มีใครใช้แล้ว
- [x] กดส่งแล้วแผงค้างอยู่ในสถานะ busy, ส่งไม่สำเร็จมีข้อความ `startFailed`
- [x] ตัดบรรทัด ⌘K และแถบ "semantic layer" ออกจากแผง (ย้ายเป็นบรรทัด trust ท้ายหน้า ไม่มีศัพท์เทคนิค), ชิปไม่เกิน 4 อัน และเป็นแถวเลื่อนแนวนอนบนมือถือ
- [x] "ดูแดชบอร์ด" และ ⌘D ไปที่ `/dashboard` (โหมดแดชบอร์ดใน state ถูกถอดออก refresh/back ไม่หลุดอีก), `app/icon.svg` แก้ favicon 404
- [x] เห็นด้วยตาแล้ว: CEO + RSM ที่ 1440×900, มือถือ 390px (ไม่มี scroll แนวนอน), ลิงก์สถานะเปิดกล่องงานที่ P1, ⌘D → `/dashboard`
- [x] ชิปที่เรียนรู้จากประวัติไม่ถูกตัดด้วย "…" อีก: `labelOf` ใช้ชื่อของ action ประจำบทบาทที่ intent ตรงกัน ถ้าไม่มีก็ใช้ "เมตริกตามมิติ" (เช่น "ปริมาณขายเข้าตามภาค") และตัด prompt เฉพาะเมื่อไม่รู้เมตริก
- [x] **ทดลองใช้โดย agent 6 บทบาท** (CEO, CFO, ผอ.ขาย, RSM อีสาน, พนักงานขาย ขอนแก่น, supply planner) แต่ละคนทำ 5-second test แล้วกดทุกจุด ผลที่ทุกบทบาทเจอตรงกันและแก้แล้ว:
  - **กดการ์ด/ชิปแล้วเจอข้อความ debug ภาษาอังกฤษของ mock** (6/6 บทบาท) — การ์ดความผิดปกติส่ง `verifySteps[0]` ที่ mock ไม่รู้จัก และชิปประจำบทบาท 16 อันไม่มีสคริปต์ ตอนนี้การ์ดถาม `ตรวจความผิดปกติของ <ขอบเขต>` ซึ่ง mock ตอบเจาะเรื่องนั้น (`focusedAlertSteps`: ตัวเลขจริง/คาด + การ์ด Alert + ขั้นตอนตรวจ) ปุ่ม "ตรวจสอบ" ในกล่องงานก็ใช้ turn เดียวกัน และเพิ่ม turn ให้ กำไรขั้นต้น / ลูกหนี้ / ภาคที่ห่างเป้า / เอเย่นต์ที่ดูแล / งบเทียบจริง / audit — เช็กแล้วว่าทุก prompt ที่หน้าแรกส่งได้ของทุก persona มีปลายทาง
  - **การ์ดโชว์ปัญหาของคนอื่น** (CFO, supply) — `openAlertsFor` เรียง ของฉัน → เมตริกที่บทบาทนี้ดู (`templateFor`) → ความรุนแรง; หน้าแรกแสดงเฉพาะสองกลุ่มแรก ที่เหลือเป็นลิงก์ "อื่น ๆ ในขอบเขต N" CFO จาก วิกฤต 30 (ยอดขายทั้งหมด) เหลือ วิกฤต 1 (ลูกหนี้ภาคใต้), supply planner เห็น DC ลำพูน 6.1 วันที่ต่ำกว่าเกณฑ์ 10 วัน
  - **ตัวเลขไม่ตรงกัน** (CEO, CFO) — status บอก 30 แต่กล่องงานโชว์ 20 เพราะ inbox ตัดที่ 20 ตอนนี้ความผิดปกติในกล่องงานแสดงได้ถึง 60 (`MAX_ALERT_ITEMS`)
  - การ์ดบอกผู้รับผิดชอบ (ผอ.ขาย), การ์ดใบที่สองเลือกคนละภาค/เมตริกกับใบแรก (CEO), KPI ยอดเทียบเป้ามี "เหลืออีก N% ถึงเป้า" สี warning (CEO, พนักงานขาย), ชิปมือถือมี fade บอกว่าเลื่อนได้ + KPI ช่องสุดท้ายเต็มแถวเมื่อจำนวนคี่, ชื่อชิปตามฤดูเป็นคำกริยา ("เตรียมสต๊อกออกพรรษา", "สรุปยอดปิดเดือน")
  - บั๊กที่เจอระหว่างทาง: `present.ts` วาด progress "ถึงเป้า" ให้ทุกเมตริกที่เป็น % (MAPE 9.6% → "เหลืออีก 90.4% ถึงเป้า") ตอนนี้เฉพาะ `target_attainment`; ความผิดปกติลูกหนี้วัดเป็นสัดส่วนเทียบปีก่อน แต่ `alertRowOf` จัดรูปเป็นเงิน ("จริง 1.7 บาท") ตอนนี้เป็น "1.7 เท่าของปีก่อน" ทุกหน้า
- [x] การ์ด "เอเย่นต์ที่ยอดตกมากที่สุด" โชว์ headline **+166%** — headline เทียบยอดทุกแถวกับ N แถวแรกหลังตัด limit แก้ใน `runMetric` แล้ว มีเทสต์
- [x] **ปุ่มส่งต่อบนการ์ดหน้าแรก** — การ์ดความผิดปกติมีปุ่ม "ส่งงานให้<ผู้รับผิดชอบ>" จาก `actionsForAlert` (กฎเดียวกับการ์ดในแชท/แดชบอร์ด ไม่เสนอให้ส่งหาตัวเอง) กดแล้วเปิดแชทด้วยข้อความปุ่ม `⟦action⟧ runTool create_handoff …` → การ์ดอนุมัติของ phase 1.8 ไม่มีอะไรถูกส่งจนกว่าจะกดอนุมัติ; `POST /api/threads` รับ `title` เพื่อให้ชื่อแชทเป็นชื่อปุ่ม ไม่ใช่ข้อความ action ดิบ — ตรวจแล้วด้วย u_prasit → การ์ดอนุมัติส่งงานให้คุณอนุชา
- [x] **จุดที่แย่ที่สุดบนแถบ KPI** (`weakestRow` ใน `present.ts`) — การ์ดที่ปักแบบแยกมิติของเมตริกที่ "ระดับ" ตัดสิน (ยอดเทียบเป้า / วันครอบคลุมสต๊อก ต่ำสุดคือแย่สุด; ลูกหนี้ค้าง / MAPE สูงสุดคือแย่สุด) โชว์ "ต่ำสุด ภาคอีสาน 68.4%" / "ต่ำสุด ศูนย์กระจายสินค้าสงขลา 13.5 วัน" ใต้ตัวเลข — ตอบ ผอ.ขาย (ภาคที่ห่างเป้า) และ supply planner (DC ที่ถูกค่าเฉลี่ยซ่อน) ด้วยกฎเดียว
- [x] **"ไปเยี่ยมวันนี้" สำหรับพนักงานขาย** (`visitsFor`) — เอเย่นต์ในขอบเขตของตัวเองสูงสุด 3 ราย: มีความผิดปกติเปิดอยู่ก่อน แล้วตามด้วยขายเข้าที่ตกแรงที่สุด 27 วันเทียบช่วงก่อน เหตุผลเป็นตัวเลข ("ปริมาณขายเข้า −81%") กดแล้วถามเทียบขายเข้า/ขายออกของเอเย่นต์นั้นก่อนไปเยี่ยม
- [ ] ค้าง: แดชบอร์ดบอก "ความผิดปกติใหม่ 44 เรื่องตั้งแต่เมื่อวาน" เพราะ engine สร้างทุกเรื่องเมื่อวาน; ใบที่สองอาจเป็นเรื่อง P3 ที่ engine อธิบายได้แล้ว; ของพนักงานขาย เอเย่นต์อันดับ 1 ในรายการเยี่ยมซ้ำกับการ์ดความผิดปกติข้างล่าง; คำตอบของ mock ตอนกดรายการเยี่ยมเป็นกราฟขายเข้า/ขายออกของเอเย่นต์ทุกราย ไม่ได้เจาะรายเดียว (โมเดลจริงกรองได้)
- [x] ถอดแผงขาวที่ครอบคำทักทาย + ช่องพิมพ์ + ชิปออก (ผู้ใช้ถาม "ถ้าเอา panel card ออกจะสวยกว่าไหม") — พอ backdrop จางแล้ว แผงไม่ได้ช่วยเรื่อง contrast อีก กลายเป็นกล่องซ้อนกล่อง ตอนนี้ช่องพิมพ์เป็นชิ้นเดียวที่ลอยขึ้นมา ตรวจแล้วทั้ง light/dark และมือถือ

### Phase 2 — the four loops (four agents in parallel)

**2A Threads, memory, quick actions** (`lib/server/threads.ts`, `lib/engine/memory.ts`, `lib/engine/recommend.ts`)
- [x] Vexa change (in agentic-ui, minimal, general): `VexaChatProps.initialMessages?: VexaMessage[]` and `id?: string` passed to `useChat`; scenario `thread-restore` in shop-admin per Vexa's CLAUDE.md; note in §9.
- [x] Threads: create on first message, save through `onMessagesChange` (throttled) to `POST /api/threads/:id`, title from the first user message, list/switch/delete in the chat column; `?preload=<packetId>` creates a thread with `HandoffPreload`.
- [x] Action events: every user message → `ActionEvent{kind:"question", intentKey}` where `intentKey` = `${metric}|${dims sorted}` from the tools the turn called (read from the saved messages), quick-action clicks → `quick_action`.
- [x] Recommender: score = 0.35·freq(30d) + 0.25·e^(−Δt/14d) + 0.15·timeOfDayMatch + 0.15·rolePeerLift + 0.10·contextSimilarity(last turn's metric) − 0.5·dismissPenalty; top 4 + 2 seasonal (calendar-aware: pre-Songkran, month-end close, Lent); each carries `reason` shown on hover ("ถามบ่อยช่วงปิดเดือน"). `GET /api/quick-actions` re-fetched after every turn.
- [x] Memory: after each completed turn, extract facts (LLM structured output with zod when a real model is chosen; rule-based when mock: metrics/dims asked, entities named); dedupe by `(type,value)`, decay 90 days; `/memory` lists and deletes; persona receives ≤ 1.5k tokens of the highest-confidence facts.
- [x] Tests: recommender ordering, decay, memory dedupe, thread save/restore.

**2B Anomaly, forecast, alerts, briefing** (`lib/engine/anomaly.ts`, `lib/engine/forecast.ts`, `lib/server/alerts.ts`)
- [x] Anomaly: for each (metric ∈ sell_out_volume, net_sales_volume, days_of_cover, production_output, ar_overdue) × watched dims, residual after weekly (dow means) + yearly (same-week last year) seasonality, rolling 56-day z-score, CUSUM level-shift; severity P1 ≥ 3σ or stock-out risk, P2 ≥ 2σ, P3 else; dedupe by root (agent → region roll-up keeps the deeper one); promotion-explained flag using the campaign table.
- [x] Hypothesis + two verify steps per alert from templates keyed on metric/direction/context (sell-in down + sell-out flat → "สต๊อกค้างที่เอเย่นต์"; PM2.5 correlation r > 0.6 → "อากาศ/ฝุ่น"); owner from `resolve_owner` (RACI table in `lib/access/raci.ts`: metric × region → role → user).
- [x] Forecast: Holt-Winters additive (weekly seasonality, period 52 on weekly aggregates) for volume per brand × region and days-of-cover per DC × SKU; 8-week horizon with ±1.28σ band; MAPE from a 12-week backtest.
- [x] Alerts page: list with severity filter, hypothesis, verify buttons (open chat with the verify prompt), dismiss (3 dismissals → threshold ×1.25 for that key, shown to the user), hand off (opens the handoff composer of 2C).
- [x] Morning brief (`lib/server/briefing.ts`): per user, top 3 alerts in scope + target attainment + open packets, rendered as a Vexa spec on the dashboard; "what changed since yesterday" diff (metrics moved > threshold, alerts closed, packets replied).
- [x] `POST /api/jobs/run` runs both engines; runs on first boot if `.data/alerts.json` is missing. Tests: all 7 injected anomalies detected with the right direction, promotion one flagged explained, MAPE < 15 % on the backtest.

**2C Handoff, inbox, notifications, outbox** (`lib/server/handoff.ts`, `app/inbox`)
- [x] `create_handoff` tool → `ContextPacket` (evidence = the `MetricQuery`s the turn ran + alert ids, digest = last 3 turns summarised by template), `Notification` for the recipient, outbox entry (mock email with the packet link).
- [x] Inbox card per packet: from/role, one-line ask, urgency, SLA, evidence rendered by re-running each query **under the recipient's access** (masked fields shown as "ถูกปิดตาม policy" with a request-access button), 3 actions: รับงาน / ขอข้อมูลเพิ่ม / ตีกลับ (with reason drafted from a template), reply thread, close requires an outcome.
- [x] "เปิดในเอเจนต์ของฉัน": creates a thread with `HandoffPreload` (system note lists the packet, its evidence and suggested actions, fenced) and sends the first assistant turn automatically ("ผมดึงข้อมูลที่เกี่ยวข้องมาแล้ว…" using the tools).
- [x] Reply from the recipient posts back into the sender's inbox thread and notification; the sender's original chat thread gets a system message linking the reply.
- [x] `send_email` tool → outbox page shows the rendered email. `resolve_owner` suggests the recipient with a reason (RACI + "เคยรับงานลักษณะนี้ N ครั้ง" from packets + current open load).
- [x] Tests: packet evidence re-resolved under recipient scope masks what the sender could see; packet lifecycle; notification created.

**2D Dashboard composer + widgets** (`lib/dashboard`, `lib/engine/compose.ts`, `app/page.tsx`)
- [x] `widget-to-spec.ts`: each `WidgetKind` → Vexa `Spec` (Metric with trend from compare; BarChart horizontal; LineChart with forecast band as a second series when available; Table ≤ 8 rows; alert_list → Alert stack; kv → KeyValue) plus a provenance line and a "ทำไมถึงเห็นอันนี้" affordance.
- [x] Role templates in `templates.ts` (CEO: national volume vs target, GM by BU, top alerts, AR overdue; RSM: region vs target by brand, top-10 falling agents, forecast; Marketing: campaign spend/reach/uplift, SoV, sentiment; Supply: days-of-cover heatmap-as-table, production vs plan, MAPE; Finance: budget vs actual, AR aging; HR: headcount/attrition).
- [x] Layout store: pin / unpin / reorder / hide; `pin_widget` tool from chat (approval card) lands in Pinned; layout is versioned with "ดู layout เมื่อวาน" rollback.
- [x] Composer (`compose.ts`): cluster `ActionEvent`s by `intentKey` (freq ≥ 3 in 14 days, not already pinned) → candidate `WidgetSpec` with `source: "ai_suggested"` and `reason` ("คุณถามคำถามนี้ 6 ครั้งใน 14 วัน"); with a real model the title is written by the LLM through structured output validated by zod, otherwise from the metric label; max 1 new suggestion per day per user; Suggested tray with accept/dismiss; promote-to-dashboard prompt in chat after the 3rd repeat of an intent.
- [x] Polish found in the phase-1 review: widgets use `BarChart` (horizontal) and `LineChart` instead of the simple `Chart` (x-labels overlap); time keys rendered in Thai short form (`ส.ค. 26`, `สัปดาห์ 38`) not `2026-W38`; an incomplete last bucket (current week/month) is marked or excluded so the line does not "fall off"; the sell-in vs sell-out overlay widget for the agent anomaly.
- [x] Tests: template per role renders valid specs (validate with Vexa's `normalizeSpec`), composer respects pinned/limit rules, layout versioning.

### Phase 3 — governance, demo script, QA (three agents in parallel)

**3A Admin console + red-team suite**
- [x] `/admin`: users × roles table, metric ACL matrix (full/masked/none per role with a legend), tool matrix per role with kill-switch (persisted, enforced by `toolsFor`), audit log with user/tool/decision filters, usage (questions/day for 14 days, top intents, questions that ended without a semantic-layer call, denied/masked/empty counters, estimated tokens and cost per the registry's default model), "จำลองมุมมอง" (runs a real `runMetric` as the selected user and shows the rows, the masking and the denial, read-only). Tool matrix fits 1440 with short role labels.
- [x] `tests/red-team.test.ts`: 60+ cross-scope probes as direct tool calls per role (other regions through region/agent filters, scope narrowing, HR and margin ACL, other users' memory, packets addressed to others, the tool surface, alert scope) → 0 leaks; min-cell suppression (`lib/access/suppression.ts` + `lib/access/suppression.test.ts`): a roll-up of `ar_overdue` / `gross_margin` / `trade_spend` covering fewer than 3 agents is closed, and suppressed rows are kept out of the summary too.

**3B Scripted demo (mock model) + demo guide**
- [x] `lib/server/mock-script.ts` (kept where phase 1 put it): `MockTurn`s for the three scenes and the persona prompts — RSM (ยอดเทียบเป้า, top-10 เอเย่นต์, เทียบปีที่แล้ว, ขายเข้าเทียบขายออก, ส่งให้ Trade Marketing), Marketing (ปุระขายดีผิดปกติ → alert cards, สต๊อกปุระพอขายอีกกี่วัน → cover table with the red band, พยากรณ์, ส่งให้ Supply), Supply (งานที่ส่งต่อมา → หลักฐาน + ทางเลือก 2 ทาง), CEO (ยอดรวม, drill ภาค → เอเย่นต์, เตรียมประชุมบอร์ด). Every turn calls the real tools; brand-aware filters so the Purra scenes hit anomalies #2 and #3.
- [x] Quick-action defaults per role were already seeded in `lib/server/quick-actions.ts`; `docs/demo.md` written: three scenes, who to sign in as, what to type, what should appear, fallback prompts and recovery steps.

**3C QA, polish, docs**
- [x] Thai copy pass; the only English left on screen is technical column headers in the IT-only console (`Tool`, `Tier`, `Metric`). Dates through `formatDateTh` (พ.ศ.), numbers through `lib/i18n/format.ts`.
- [x] 375 px pass (no horizontal page scroll on `/`, `/dashboard`, `/admin`, `/c/[threadId]`; wide tables scroll inside their panel), dark mode pass on the new pages, focus rings on every admin control, empty states on audit/usage/intents, `app/(app)/dashboard/loading.tsx` + `components/dashboard/widget-skeleton.tsx` for the widget skeletons, dashboard cards equal height per row (the 2D gap is gone).
- [x] `README.md` rewritten (surfaces, loops, governance, layout), `docs/architecture.md` written (request path, layers, data model, `runMetric`, the four loops, governance, models), CLAUDE.md commands verified.
- [x] `bun run typecheck`, `bun run test` (187 pass, 25 ใหม่จาก 3A), **`bun run build` passes** (the phase-2 unknown), curl of every route, `.data` reset with `bun run seed`.

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

- [x] `VexaChat` `initialMessages` / `id` props (phase 2A) — thread restore for any host; both are passed straight to `useChat`. No shop-admin scenario was added: it is a prop pass-through, not a new control path, and Cop drives its own `useChat` in `components/chat/session-chat.tsx` rather than `VexaChat`.
- [x] `thinLabels` in `src/react/components.tsx` (phase 1.5) — the last axis label no longer crowds the one before it (`> last - step` instead of `>= last - step / 2`); long labels (Thai `สัปดาห์ 38`) overlapped in a narrow `LineChart`.
- [x] Data-card upgrade (phase 1.6), all general, all five places per Vexa's CLAUDE.md:
  - `Card` gains `meta` (scope line under the title) and `footnote` (source line under a hairline), so a summary sentence never has to live in `description`.
  - `Metric` gains `delta` (tinted pill with an arrow), `tone` (`good` / `bad` / `neutral` — whether the arrow's direction is good news, for metrics like churn or overdue payments), `note` and `size` (`lg` = the headline number of a card, bare instead of boxed).
  - `Alert` gains `meta` (the numbers behind the callout) and a severity dot.
  - `Table` columns gain `align` (`end` for numbers, with `tabular-nums`) and `tone` (`delta` colours a signed percentage by its sign); row hover.
  - `RankList` (new): ranked rows with a proportional bar, the value and its delta — replaces a two-column `Table` or a horizontal `BarChart` for "compare one number across named things".
  - `LineChart` series accept `null` values (a real gap, not a zero) and `style: "dashed"`, so a forecast can continue an actual series.
  - `--vexa-card-edge` token for the 1px card shadow edge in `src/styles.css`.
- [x] `VexaProvider renderApproval` + approvals under the reply (phase 1.8):
  - `renderApproval: ({ tool, input, state, approved, approve, reject }) => ReactNode` on `VexaProvider` — a host draws the whole decision itself and returns null to keep Vexa's card. Cop uses it for `components/cards/approval-card.tsx`; without it an approval can only be described in words (`describeToolCall`), never designed.
  - `PendingApprovals` moved below the reply text in `AssistantMessage`: the decision now reads after the sentence that leads to it, instead of above the explanation.
  - `Alert.body` is nullable (schema + component), so a row that would only repeat the previous row's sentence can show its title and numbers alone.
- [x] Host catalog components (phase 1.7) — the "pluggable catalog" candidate above, built:
  - `extendCatalog({ components, actions })` in `src/core/catalog.ts` (which now exports `vexaComponents` / `vexaActions` as plain maps), `createVexaHandler({ catalog })` → `buildAgentInstructions({ catalog })`, so a host's components reach the prompt.
  - `VexaProvider components` merges a host's renderers into the registry every `SpecView` uses; `SpecView components` overrides per view.
  - `VexaProvider normalizeSpec: (spec, { toolOutputs }) => spec` runs before render, so a host can enforce its own card contract on whatever the model emitted.
  - `/tools/<name>.1`, `.2` … in spec state beside `/tools/<name>`, so two cards in one turn bind to different calls of the same tool.
  - `storedToolValue` keeps a server tool's own shape whole; only `{ ok, data, summary }` host-tool results are unwrapped to `data`. Before this, any server tool answering `{ ok: true, ... }` without `data` was flattened to `{ ok, summary }` and its payload was lost to specs.
- [x] The three card-style lines Cop had added to Vexa's `SHARED_INTRO` (headline Metric first, RankList instead of BarChart, Table align/tone) moved back to Cop's `COP_RULES`: in Vexa they dropped shop-admin `eval:ui` `revenue-by-status` and `week-dashboard` from 5/5 to 2/5. `eval-ui` `labelledValues` now reads `RankList` rows and `revenue-by-status` accepts a RankList whose values match the store, since the catalog itself recommends RankList for a one-number comparison.

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
