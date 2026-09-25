# Cop — build plan

## สถานะ (updated 2026-09-25)
ทำแล้ว: Phase 0–7 (ดู `git log`) · ทดสอบเป็น HR + 8A รายการเดียว/สถานะ (`b417c51`) · 8B ปุ่มลงมือ, แท็บ "ต้องจัดการ", สรุปเช้าจากรายการ + AI เขียนประโยคเปิด (`f77cbeb`) · 8C จัดลำดับตามพฤติกรรม, memory ซ่อนประเภท, watch ในรายการ, ประวัติเดโม · 8D Dashboard เรียนจากรายการ (`79bc02d`, 8C `7bb4b35`) · 8D+ ความผิดปกติเป็นงานไม่ใช่การขยับ · 8E ความเกี่ยวข้องตามสายบังคับบัญชา · 8F เรื่องในตัวตรวจ + ข่าวดี (`a3cab47`) · 8G การตลาด/ซัพพลาย/การเงิน/IT เชิงรุก (`f9c2030`) · 8H หน้าแรกหัวหน้า (`47ccd56`) · 8I เดินทดสอบหลัง seed: ส่งต่อครั้งเดียว เรื่องเดียวครั้งเดียว · ปิดส่งงาน · 9A หน้าแรกเดียวกันทุกคน (8I–9A ยังไม่ commit)
ค้าง:
- **ปิดระบบส่งงานหากัน** (user decision 2026-09-25: "คนไม่ได้เข้ามาใช้บ่อย เขาจะไปถามรายละเอียดและ capture ไปส่งต่อกันเอง") — ปิดที่สวิตช์ admin (คุณต้น 20:50) ไม่ลบโค้ด · seed ใหม่จึงไม่มีงานส่งต่อตั้งต้น · การ์ดทีมไม่พูด "ยังไม่ได้ส่งต่องาน" เมื่อปิด · 8I ส่วนส่งต่อยังอยู่ในโค้ดสำหรับวันที่เปิดใหม่
- 8B: ให้โมเดลเลือกปุ่มจาก id ที่กฎเสนอ ยังไม่ทำ (ตอนนี้กฎเสนอปุ่มเดียวต่อรายการ; เมื่อปิดส่งงานรายการส่วนใหญ่ไม่มีปุ่ม)
- เดิม: "An error occurred." ขั้นที่สองของ Gemini กับ CRM 1/13 ยังไม่รู้สาเหตุ (dev แสดงข้อความจริงแล้ว) · eval Gemini เต็มชุดยังไม่ได้รันตั้งแต่ Phase 6
- `.data` seed ใหม่ 2026-09-25 หลังปิดส่งงาน · ประวัติเดโม `ev_demo_feed_*` 14 รายการ · ไม่มีงานส่งต่อ
- 8I ข้อที่ยังเปิด (ดูหัวข้อ 8I)
ค้นพบ:
- dev server ที่รันค้างนานรันงานตรวจความผิดปกติตามเวลาด้วยโค้ดเก่า แล้วเขียนทับ `alerts.json` หลัง seed (ไม่มี `alsoOwnerIds`, ระดับเชียงใหม่ผิด → 5 เทสต์พัง) → รีสตาร์ท dev ก่อน seed ทุกครั้งที่แก้ engine
- ข้อมูลเริ่ม 2025-04-01: `prev_year` ของช่วงก่อน เม.ย. 2569 เคยหายเงียบ → ตอนนี้ตัดช่วงให้เทียบได้ + `headline.compareNote`
- เทสต์รันบนสำเนา `.data` (`scripts/test-data.ts`) ผลจึงขึ้นกับสิ่งที่ seed ไว้ — เทสต์ที่เพิ่ม event ต้องแยก event เดโมออกก่อน
- คนในรายการของหัวหน้า = ลูกทีมโดยตรงเท่านั้น (ทั้งสายทำให้ CEO เห็นทุกคน) · `create_handoff` รับเฉพาะผู้ใช้ Cop จึงไม่มีปุ่มสำหรับคนที่หัวหน้าไม่ได้ใช้ Cop
- ช่อง KPI หน้าแรกทุกบทบาท: เมตริกซ้ำใบที่สองแสดงกลุ่มที่แย่ลงมากสุด (≥ 25%) แทนหัวเลขซ้ำ · สรุปเช้าด้วย Gemini ~$0.0056/คน ส่วนใหญ่เป็น reasoning token
ถัดไป: /ship 8I–9A · ที่ควรคิดต่อจากการตัดสินใจนี้: คนจะ capture การ์ดไปส่งเอง การ์ดจึงต้องอ่านรู้เรื่องเมื่อหลุดออกจาก Cop (ขอบเขต ช่วงเวลา แหล่งข้อมูลอยู่ในภาพ) · ข้อที่เปิดของ 8I (KPI กับการ์ดคนละช่วง, ปุ่มแยกภาคของ rep)

## 1. What we are building

One Next.js app, signed-in personas. **UX principle (decided with the user on 2026-09-22): this is an AI agent, not an admin system.** The chat is the front door; the landing shows what needs this user (status line, KPI strip from pinned cards, their own alerts) and the dashboard is one click away (revised 2026-09-23: the blurred dashboard backdrop was removed); everything else is a drawer or a card inside the chat. Visual language = the Vexa website (dark-first, indigo→violet glow blobs, glass panels, elevated cards with colored shadows, gradient display text). No sidebar of admin menus.

| Surface | Route | What it does |
|---|---|---|
| Home = chat landing | `/` | Full-viewport: the user's pinned dashboard cards sit **behind** the chat, blurred and dimmed (parallax on scroll, ⌘D / "ดูแดชบอร์ด" brings them to the front at full opacity). In front: a gradient greeting, **Cop speaks first** (one-sentence morning brief: alerts found overnight, handoffs waiting), a large glowing composer, 4–6 learned quick-action chips, and 2–3 **ambient cards** (top alert, brief, handoff waiting) rendered as Vexa specs — clicking one starts a session with that context |
| Session | `/c/[threadId]` | Sending from the landing morphs it into a session: composer docks to the bottom, the conversation is a centered column (Claude style, max-w-3xl), generative UI inline in the reply; a card can expand to a full-width sheet. Thread rail on the left: collapsed to icons by default, expands (≡ or hover) into "แชทใหม่", search, sessions grouped วันนี้ / เมื่อวาน / 7 วัน / เก่ากว่า, rename/delete |
| Inbox drawer | `?inbox` (right drawer, from the bell) | One drawer for everything that arrived: handoffs (accept / need info / return / open in my agent), alerts (hypothesis, verify, dismiss), replies. Each item is also a card the agent can show inline in chat |
| Dashboard | `/dashboard` (and ⌘D from home) | The pinned + suggested cards at full size, with pin/unpin, "ทำไมถึงเห็นอันนี้", and the suggested tray; visually the same cards as the landing backdrop |
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
- [x] `lib/semantic/metrics.ts`: every `MetricId` with owner, certified, dims, aclDims, synonyms (Thai + English, incl. "เอเย่นต์", "ซับเอเย่นต์", "ลัง", "โหล", "ลิตร", "เฮกโตลิตร"), unit, format, description; `findMetric(text)` synonym lookup.
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
- [x] `/dashboard`: the same cards at full size with pin/unpin (no manual reorder: the grid orders itself by attention, user decision 2026-09-23), suggested tray accept/dismiss, "ทำไมถึงเห็นอันนี้" hover-card, versioned layout; role templates in `lib/dashboard/templates.ts`, `widget-to-spec.ts` for every `WidgetKind` (+ masked/denied variants), `lib/server/dashboard.ts` with `layoutFor(access)` and a placeholder `resolveWidget` the orchestrator swaps for the engine.
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
- [x] (2026-09-25) ข้อความเป็น "ตั้งแต่ที่คุณเปิดครั้งก่อน" นับจาก id ที่คงที่ข้ามรอบ engine แล้ว · ใบที่สองไม่เป็น P3 · การ์ดไม่ซ้ำรายการเยี่ยม (`9e8c037`) · mock ตอนกดรายการเยี่ยมยังไม่เจาะรายเดียว (โมเดลจริงกรองได้ ไม่แก้) — เดิม: แดชบอร์ดบอก "ความผิดปกติใหม่ 44 เรื่องตั้งแต่เมื่อวาน" เพราะ engine สร้างทุกเรื่องเมื่อวาน; ใบที่สองอาจเป็นเรื่อง P3 ที่ engine อธิบายได้แล้ว; ของพนักงานขาย เอเย่นต์อันดับ 1 ในรายการเยี่ยมซ้ำกับการ์ดความผิดปกติข้างล่าง; คำตอบของ mock ตอนกดรายการเยี่ยมเป็นกราฟขายเข้า/ขายออกของเอเย่นต์ทุกราย ไม่ได้เจาะรายเดียว (โมเดลจริงกรองได้)
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
- [x] Layout store: pin / unpin / hide; `pin_widget` tool from chat (approval card) lands in Pinned; layout is versioned with "ดู layout เมื่อวาน" rollback.
- [x] Composer (`compose.ts`): cluster `ActionEvent`s by `intentKey` (freq ≥ 3 in 14 days, not already pinned) → candidate `WidgetSpec` with `source: "ai_suggested"` and `reason` ("คุณถามคำถามนี้ 6 ครั้งใน 14 วัน"); with a real model the title is written by the LLM through structured output validated by zod, otherwise from the metric label; max 1 new suggestion per day per user; Suggested tray with accept/dismiss; promote-to-dashboard prompt in chat after the 3rd repeat of an intent.
- [x] Polish found in the phase-1 review: widgets use `BarChart` (horizontal) and `LineChart` instead of the simple `Chart` (x-labels overlap); time keys rendered in Thai short form (`ส.ค. 26`, `สัปดาห์ 38`) not `2026-W38`; an incomplete last bucket (current week/month) is marked or excluded so the line does not "fall off"; the sell-in vs sell-out overlay widget for the agent anomaly.
- [x] Tests: template per role renders valid specs (validate with Vexa's `normalizeSpec`), composer respects pinned/limit rules, layout versioning.

### Phase 3 — governance, demo script, QA (three agents in parallel)

**3A Admin console + red-team suite**
- [x] `/admin`: users × roles table, metric ACL matrix (full/masked/none per role with a legend), tool matrix per role with kill-switch (persisted, enforced by `toolsFor`), audit log with user/tool/decision filters, usage (questions/day for 14 days, top intents, questions that ended without a semantic-layer call, denied/masked/empty counters, estimated tokens and cost per the registry's default model), "จำลองมุมมอง" (runs a real `runMetric` as the selected user and shows the rows, the masking and the denial, read-only). Tool matrix fits 1440 with short role labels.
- [x] Handoff switch on `/admin` → เครื่องมือ (2026-09-23): one toggle turns off person-to-person work for everyone — `create_handoff` and `send_email` leave `toolsFor` and the session `toolAllow` (so card buttons vanish too), inbox replies return 403, the alert "ส่งต่อ" button hides, the persona says the system is closed, the demo story sends no packet. Stored in `.data/switches.json`, which `bun run seed` keeps. Tests now run on a temp copy of `.data` (`scripts/test-data.ts`) so they never send packets or notifications to real personas.
- [x] Role permissions editable on `/admin` (2026-09-23): every metric cell (● → ◐ → ○) and every role × tool cell toggles; overrides live in `.data/role-overrides.json` (kept by seed, not copied into tests), are applied by `liveAccessFor` (session, watches, digest, simulate), show a ring and who changed them, and reset in one click. Destructive tools (`run_job`) can only be taken away, never given outside the roles the surface names.
- [x] Admin console redesigned (2026-09-23), overriding the "deliberately plain" note in §1: six tabs (ภาพรวม, สิทธิ์ตามบทบาท, เครื่องมือ, Audit, การใช้งาน, จำลองมุมมอง) split into `components/admin/*` with server actions in `app/(app)/admin/actions.ts`; a "สั่ง Cop" bar on top; permissions edited per role (metrics grouped by department with a 3-way control, tools as switches) with a compare-all-roles matrix as a second view. New IT-only destructive tool `set_permission` (approval card) lets IT change a role's metric level or tool from chat.
- [x] Login is role-first (2026-09-23): step 1 picks one of 10 roles (what it sees, scope, metric count under the live overrides), step 2 picks a person of that role; IT lands on `/admin`. The demo-story picker (`lib/demo/stories.ts`) is gone, and the account sheet's persona switcher is grouped by role.
- [x] `tests/red-team.test.ts`: 60+ cross-scope probes as direct tool calls per role (other regions through region/agent filters, scope narrowing, HR and margin ACL, other users' memory, packets addressed to others, the tool surface, alert scope) → 0 leaks; min-cell suppression (`lib/access/suppression.ts` + `lib/access/suppression.test.ts`): a roll-up of `ar_overdue` / `gross_margin` / `trade_spend` covering fewer than 3 agents is closed, and suppressed rows are kept out of the summary too.

**3B Scripted demo (mock model) + demo guide**
- [x] `lib/server/mock-script.ts` (kept where phase 1 put it): `MockTurn`s for the three scenes and the persona prompts — RSM (ยอดเทียบเป้า, top-10 เอเย่นต์, เทียบปีที่แล้ว, ขายเข้าเทียบขายออก, ส่งให้ Trade Marketing), Marketing (ปุระขายดีผิดปกติ → alert cards, สต๊อกปุระพอขายอีกกี่วัน → cover table with the red band, พยากรณ์, ส่งให้ Supply), Supply (งานที่ส่งต่อมา → หลักฐาน + ทางเลือก 2 ทาง), CEO (ยอดรวม, drill ภาค → เอเย่นต์, เตรียมประชุมบอร์ด). Every turn calls the real tools; brand-aware filters so the Purra scenes hit anomalies #2 and #3.
- [x] Quick-action defaults per role were already seeded in `lib/server/quick-actions.ts`; `docs/demo.md` written: three scenes, who to sign in as, what to type, what should appear, fallback prompts and recovery steps.

**3C QA, polish, docs**
- [x] Thai copy pass; the only English left on screen is technical column headers in the IT-only console (`Tool`, `Tier`, `Metric`). Dates through `formatDateTh` (พ.ศ.), numbers through `lib/i18n/format.ts`.
- [x] 375 px pass (no horizontal page scroll on `/`, `/dashboard`, `/admin`, `/c/[threadId]`; wide tables scroll inside their panel), dark mode pass on the new pages, focus rings on every admin control, empty states on audit/usage/intents, `app/(app)/dashboard/loading.tsx` + `components/dashboard/widget-skeleton.tsx` for the widget skeletons, dashboard cards equal height per row (the 2D gap is gone).
- [x] `README.md` rewritten (surfaces, loops, governance, layout), `docs/architecture.md` written (request path, layers, data model, `runMetric`, the four loops, governance, models), CLAUDE.md commands verified.
- [x] `bun run typecheck`, `bun run test` (187 pass, 25 ใหม่จาก 3A), **`bun run build` passes** (the phase-2 unknown), curl of every route, `.data` reset with `bun run seed`.

### Phase 4 — จากแชทที่รอคำถาม ไปเป็น agent ที่เรียนรู้และทำงานเอง (user review 2026-09-23)

ผู้ใช้: "อยากให้ AI ทำงานอยู่หลายจุด ไม่ให้ manual แล้วปั้นข้อมูลแล้วแค่ chat … dashboard น่าเบื่อหรือแสดงของไม่ตรงใจ ยัดเยียดของที่ไม่จำเป็นหรือเปล่า ศึกษาเรียนรู้จาก user แค่ไหน … ไม่งั้นทำไปคนไม่ใช้มันเปลืองงบ"

ผลตรวจโค้ดและ `.data/` (2026-09-23):
- **severity ใช้ไม่ได้**: alert เปิดที่ |z| ≥ 4 (`Z_OPEN`) แต่ P1 คือ |z| ≥ 3 (`Z_CRITICAL`) → ทุกเรื่องที่ `explain` อธิบายไม่ได้เป็น P1 อัตโนมัติ (30 จาก 44) รวมถึงขายเข้า **+14%** ของเอเย่นต์รายเดียว ทิศที่เป็นข่าวดีถูกนับเป็นวิกฤตเท่ากับขายเข้า −80%
- **ปิด alert แล้วกลับมา**: `toAlert` เปลี่ยน `dismissed` กลับเป็น `open` ทุกรอบที่ job รัน; การปิดเป็นของทุกคน (คนหนึ่งปิด อีกคนหายด้วย); `POST /api/alerts/[id]` ไม่ตรวจว่า alert อยู่ในขอบเขตของผู้กด (ใครก็ปิด alert ของ CEO ได้ถ้ารู้ id)
- **สัญญาณพฤติกรรมไม่ถูกส่ง**: `events.json` มีแค่ `question` 76 / `quick_action` 13 — `alert_open`, `widget_view`, `dismiss` มีใน contract และ API แต่ไม่มี UI ไหนส่ง ระบบจึงไม่รู้ว่าการ์ดไหนไม่มีใครดู
- **เหตุผลที่ไม่จริง**: chip ตั้งต้น (`quick-actions.ts` "คุณถามคำถามนี้ทุกต้นสัปดาห์", "เปิดดูทุกเช้า"), การ์ดใน `templates.ts` ("คุณเปิดดูลูกหนี้ค้างชำระ 4 ครั้งใน 14 วัน"), ชิปสิ้นเดือน ("คนตำแหน่งเดียวกับคุณถามเรื่องนี้บ่อย") แสดงกับผู้ใช้ใหม่ที่ไม่เคยทำสิ่งนั้น
- **แดชบอร์ดโตอย่างเดียว**: `compose.ts` เพิ่มได้วันละใบ ไม่มีอะไรเสนอให้ถอดการ์ดที่ไม่มีคนดู; การ์ดที่ค่าปกติกินที่เท่ากับการ์ดที่ขยับแรง; "เปลี่ยนไปตั้งแต่เมื่อวาน" นับจากวันที่ alert ถูกสร้าง ไม่ใช่จากครั้งล่าสุดที่ผู้ใช้เปิด
- **ผลลัพธ์ไม่ถูกเอากลับมาใช้**: `packet.outcome` ถูกเก็บตอนปิดงานแต่ไม่มีใครอ่าน alert เดิมไม่รู้ว่าครั้งก่อนเป็นเรื่องจริงหรือ noise และแก้อย่างไร
- **ไม่มีอะไรทำงานเองตามเวลา**: engine รันตอนบูตครั้งแรกหรือเมื่อ IT กด; ผู้ใช้ตั้งเงื่อนไขเฝ้าดูของตัวเองไม่ได้ ต้องเปิดแอปมาถามเอง
- memory เป็น keyword ("สนใจสต๊อกคงเหลือ", "ติดตาม สิงห์") ไม่จำเกณฑ์ การตัดสินใจ หรือว่าเรื่องแบบไหนส่งให้ใคร

หลักของ phase นี้: **เรียนรู้ก่อน แล้วค่อยทำเอง** (agent ที่ทำงานเองบน alert ที่ยังมี noise ทำลายความเชื่อถือเร็วกว่าเดิม) · ทุกอย่างที่ส่งออกยังผ่าน approval (D6) · แดชบอร์ดยังไม่ขยับเอง (D3) มีแต่ "เสนอ" · ตัวเลขยังมาจาก semantic layer · ไม่เพิ่ม dependency ใหม่ ลำดับ 4A → 4B → 4C → 4D → 4E

**4A ปิดวงการเรียนรู้ และ alert ที่เชื่อได้** (`lib/engine/anomaly.ts`, `lib/server/alerts.ts`, `app/api/alerts/[id]`, `components/inbox/drawer.tsx`, `components/landing/landing.tsx`, `lib/server/quick-actions.ts`, `lib/dashboard/templates.ts`, `lib/engine/seasons.ts`)
- [x] severity ตามผลกระทบ ไม่ใช่ z อย่างเดียว (`severityOf`): ทิศที่เสียหาย (`toneOf` = bad) และห่างจากคาด ≥ 25% หรือ days-of-cover ≤ 7 → P1; ทิศเสียหาย ≥ 10% → P2; ข่าวดี ≥ 25% → P2 (ต้องเตรียมของ); ที่เหลือ → P3; อธิบายได้แล้ว → P3 เหมือนเดิม; days-of-cover ต่ำกว่าเกณฑ์แต่เกิน 7 วัน → P2 — เกณฑ์เป็นค่าคงที่ต้นไฟล์ มีเทสต์ และเทสต์ §5.3 เดิมยังผ่าน
- [x] การปิด alert แยกสองความหมาย: **"ไม่เกี่ยวกับฉัน"** = ซ่อนเฉพาะผู้ใช้นั้น 14 วันต่อ slice (`alert-mutes`: userId + `thresholdKey`) ไม่กระทบคนอื่น; **"ไม่ใช่ความผิดปกติ"** (เฉพาะเจ้าของ alert หรือหัวหน้าในสายบังคับบัญชา — `canJudge`; ปุ่มนี้ไม่แสดงกับคนอื่น และ API ตอบ 403) = ปิดสำหรับทุกคนและนับเข้า `alert-thresholds` แบบเดิม
- [x] alert ที่ถูกปิดแบบ "ไม่ใช่ความผิดปกติ" ไม่กลับมาเปิดใน job รอบถัดไป เว้นแต่ severity แย่ลง (`toAlert` เก็บ severity ตอนที่ปิดไว้เทียบ)
- [x] `POST /api/alerts/[id]` ตรวจขอบเขต (`visibleAlert`) ก่อนทำอะไร — alert นอกขอบเขตตอบ 404 เหมือนไม่มี; รับ `open` / `mute` / `dismiss` — เทสต์ใน `lib/server/alerts.test.ts`
- [x] UI ส่งสัญญาณจริง: เปิดการ์ด alert บนหน้าแรก / กด "ตรวจสอบ" ในกล่องงาน → `alert_open` (intentKey `alert:<thresholdKey>`, metric ของ alert); การ์ดแดชบอร์ดที่อยู่ในจอ ≥ 1.5 วินาที → `widget_view` (intentKey `widget:<id>`, ไม่เกินวันละครั้งต่อการ์ด) ผ่าน `POST /api/quick-actions` ที่มีอยู่ (`components/dashboard/seen-tracker.tsx`, dedupe รายวันใน route)
- [x] เหตุผลต้องจริง: chip ตั้งต้นและการ์ดจาก template บอกว่า "ตั้งต้นสำหรับ<ตำแหน่ง>" จนกว่าจะมีพฤติกรรมจริงรองรับ; ลบเหตุผลที่อ้างพฤติกรรมของผู้ใช้หรือเพื่อนร่วมตำแหน่งที่ระบบไม่ได้นับ — เทสต์ `lib/server/quick-actions.test.ts` ทุก persona; layout ที่เก็บไว้ใน `.data` ได้เหตุผลใหม่จาก template ตอนอ่าน (`withTemplateReasons`)
- [x] ตรวจ (curl): P1 ทั้งระบบ 30 → 7 (P2 6, P3 31); วิกฤตบนหน้าแรก CEO 30 → 6, CFO 1, supply 1, RSM อีสาน 5; rep อีสานกด "ไม่ใช่ความผิดปกติ" บน alert ของ RSM ได้ 403, RSM ภาคเหนือกดบน alert อีสานได้ 404
- [x] ~~ค้าง: P1 ของ RSM อีสาน 4 ใน 5 เรื่องเป็นเรื่องเดียวกัน~~ → ปิดใน 4F

**4B แดชบอร์ดที่แสดงเฉพาะสิ่งที่เปลี่ยน** (`lib/dashboard/attention.ts` ใหม่, `lib/server/dashboard.ts`, `lib/server/briefing.ts`, `components/dashboard/dashboard-view.tsx`, `app/(app)/dashboard/page.tsx`)
- [x] `attentionOf` (`lib/dashboard/attention.ts`) → `moved` เมื่อ มี alert ที่เกี่ยวกับผู้ใช้เปิดบนเมตริกนั้น / ระดับต่ำกว่าเกณฑ์ (ยอดเทียบเป้า < 95%, วันครอบคลุมสต๊อก < 10 วัน — บอกแถวที่แย่สุดผ่าน `weakestRow`) / headline ขยับ ≥ 5% / แถวใดแถวหนึ่งแย่ลง ≥ 25% (`sharpestHarm` ใหม่ใน `present.ts`) พร้อมเหตุผลหนึ่งบรรทัด; นอกนั้น `steady`
- [x] แดชบอร์ด: การ์ด `moved` เต็มขนาดก่อน การ์ด `steady` ยุบเป็นแถวเดียว "ปกติ" (ชื่อ + ตัวเลขหลัก) กดแล้วขยาย (`SteadyPanel`) — ลำดับที่ผู้ใช้จัดยังอยู่ภายในแต่ละกลุ่ม (D3: ไม่มีการ์ดหาย) ผล: CEO ปกติ 1 จาก 4, supply 2 จาก 4, marketing 4 จาก 4
- [x] เสนอถอด: การ์ดที่ปักแต่ไม่มี `widget_view` 14 วัน (และปักมานานกว่า 14 วัน) ขึ้นในถาดคำแนะนำ "ไม่ได้เปิดดู 14 วัน — เอาออกไหม" ผู้ใช้ตัดสินใจเอง (เอาออก / เก็บไว้ = นับเป็นการดู) ไม่มีการถอดอัตโนมัติ — เริ่มตัดสินเมื่อมีประวัติการดูครบ 14 วันแล้วเท่านั้น (`staleWidgets`)
- [x] "เปลี่ยนไปตั้งแต่ครั้งก่อน": เทียบกับชุด alert ที่ผู้ใช้เห็นตอนเปิดครั้งก่อน (`lib/server/visits.ts`, reload ภายใน 30 นาทีนับเป็นครั้งเดียวกัน; เทียบชุด id ไม่ใช่เวลา เพราะเวลา alert เป็นปฏิทินข้อมูล ไม่ใช่นาฬิกาจริง) ครั้งแรกไม่มีอะไรนับเป็น "ใหม่" และนับเฉพาะ alert ที่เกี่ยวกับผู้ใช้ (`relevanceOf` ≠ other) — แก้ "ความผิดปกติใหม่ 44 เรื่อง" ที่ค้างจาก 1.9
- [x] ตรวจด้วย curl: `/dashboard` 200 ของ CEO / supply / RSM / rep มีแผง "ปกติ N การ์ด" และเหตุผลบนการ์ดที่ขยับ
- [x] ดูด้วยตา (chrome-devtools) ที่ 1440 และมือถือ: แดชบอร์ด CEO, หน้าแรก CEO / supply, กล่องงาน, แผงบัญชี, `/admin` ใช้จริงไหม — ไม่มี scroll แนวนอน · เจอและแก้: การ์ด "ความผิดปกติที่ต้องดู" กรองตามเมตริกของ template จนไม่เห็น P1 ขายเข้า −80% (ตอนนี้แสดง alert ที่เกี่ยวกับผู้ใช้ทุกเมตริก), หัวข้อ "ตั้งแต่เมื่อวาน" → "ตั้งแต่ครั้งก่อนที่คุณเปิด", เหตุผล "ต่ำกว่าเกณฑ์" บอกเกณฑ์ (95%), กล่องงานและแผงบัญชีโชว์ "ยังไม่มี…" ระหว่างโหลด, การ์ดใบที่สองบนหน้าแรกเลือก P3 ที่อธิบายได้แล้วทั้งที่มี P2 รออยู่ (ปิดเรื่องค้างจาก 1.9)

**4C งานที่ agent ทำเองโดยไม่ต้องรอถาม** (`lib/engine/personal-watches.ts` ใหม่, `lib/server/agent/tools.ts`, `lib/contracts/tools.ts`, `instrumentation.ts` ใหม่, `lib/server/scheduler.ts` ใหม่)
- [x] tool `watch_metric` (write, ผ่าน approval เหมือน `pin_widget`): "เตือนฉันถ้า<เมตริก><ขอบเขต> ต่ำกว่า/สูงกว่า X" หรือ "เปลี่ยนเกิน N%" เก็บ `MetricQuery` + เงื่อนไข ไม่เก็บค่า; ผู้ใช้ดู/ลบได้ในแผงบัญชี ("เรื่องที่ Cop เฝ้าดูให้คุณ", `/api/watches`) · การ์ดอนุมัติแสดง "เตือนเมื่อ <เมตริก · ขอบเขต> ต่ำกว่า X" · สร้างไม่ได้ถ้า query นอกขอบเขต (ไม่เก็บ)
- [x] job `watches` (`lib/server/watches.ts`, กฎใน `lib/engine/personal-watches.ts`) ประเมินทุก watch ด้วย `AccessContext` ของเจ้าของ (สิทธิ์ถูกบังคับเหมือนตอนถาม) ถ้าเข้าเงื่อนไขครั้งแรกในรอบ → notification ในกล่องงาน + รายการใน outbox (จำลอง LINE/อีเมล) พร้อมตัวเลขจาก `runMetric`; ไม่เตือนซ้ำจนกว่าค่าจะกลับเข้าเกณฑ์แล้วหลุดอีกครั้ง · ระดับสต๊อกอ่านค่าวันล่าสุด ไม่เฉลี่ยทั้งช่วง (ค่าเฉลี่ย 7 วันของ DC ลำพูน 13.7 วันซ่อนเพอร์ร่า 600 ที่เหลือ 6 วัน) และดูทุกแถว ไม่ตัดที่ limit
- [x] scheduler ในโปรเซส (`instrumentation.ts` `register()` → `lib/server/scheduler.ts`, กันรันซ้อนด้วย flag บน `globalThis`): anomaly + forecast วันละครั้ง, personal watches ทุกชั่วโมง, สรุปตอนเช้า 07:00 ต่อผู้ใช้ที่มีเรื่อง (P1/P2 ของตัวเอง + งานที่รอ + watch ที่เข้าเงื่อนไข) ลง outbox — ผู้ใช้ที่ไม่มีเรื่องไม่ได้อะไร; IT รันเองได้ผ่าน `run_job` / `POST /api/jobs/run` (`watches`, `digest`, `tick`) · สรุปตอนเช้าไม่ซ้ำ alert ที่เคยส่งแล้ว (`digests` collection) · ปิดได้ด้วย `COP_SCHEDULER=off` · `/outbox` แสดงสิ่งที่ Cop ส่งถึงผู้ใช้ด้วย
- [x] mock มี turn สำหรับ "เตือนฉันถ้า…" (การ์ดอนุมัติ `watch_metric`) และ eval case `planner-watch` (scripted) + `rsm-watch-agent` (โมเดลจริง) — eval มีเช็ก `askedApproval` ใหม่ (เรียก tool ที่ถูกและ input ผ่าน schema)
- [x] ตรวจ: watch ของ supply planner (DC ลำพูน < 10 วัน) → `tick` รัน engine + watches + digest → กล่องงานมีแจ้งเตือน 1, `/outbox` มี "เข้าเงื่อนไขแล้ว … เพอร์ร่า ขวด PET 600 มล. 6 วัน" และสรุปตอนเช้า; รันซ้ำไม่เตือนซ้ำ; rep ภาคเหนือตั้ง watch ภาคอีสานถูกปฏิเสธ (เทสต์)
- [x] (2026-09-25) scheduler ทำงานใน dev server ปัจจุบัน: `job-runs` engine เที่ยงคืน, watches รายชั่วโมง, digest 07:07 — เดิม: dev server ต้อง restart ครั้งหนึ่งให้ `instrumentation.ts` เริ่มจับเวลา (prompt "เตือนฉันถ้า…" กับ Gemini ผ่านแล้วใน 4F: `rsm-watch-agent` 3/3, `planner-watch` 3/3)

**4D ความจำที่จำการตัดสินใจ และผลลัพธ์ที่ย้อนกลับมาสอน** (`lib/server/handoff.ts`, `lib/server/alerts.ts`, `lib/engine/memory.ts`, `components/inbox/drawer.tsx`, `lib/cards/alert-row.ts`)
- [x] ปิดงาน handoff ที่แนบ alert ต้องเลือกว่า "เป็นเรื่องจริง" หรือ "ไม่ใช่ปัญหา" พร้อมสรุปผล → `alert-outcomes` (thresholdKey, verdict, outcome, ผู้ปิด, วันที่); "ไม่ใช่ปัญหา" นับเป็นการปิดแบบ "ไม่ใช่ความผิดปกติ" ของ 4A, "เป็นเรื่องจริง" = alert `resolved` — ปิดโดยไม่เลือกได้ 400 (`lib/server/outcomes.ts`, ปุ่มสองปุ่มในกล่องงาน)
- [x] alert บน slice เดิม (รวมถึงเรื่องที่ถูกปิดว่าไม่ใช่ปัญหาแล้วเปิดใหม่เพราะแย่ลง)แสดง "ครั้งก่อน: <ผล> — <ชื่อ>, <วันที่>" บนการ์ดหน้าแรก กล่องงาน และผล `get_alerts` (`lessons` — อยู่ในผล tool ซึ่ง Vexa fence ให้แล้ว เพราะเป็นข้อความที่ผู้ใช้อื่นพิมพ์)
- [x] ความจำจากการกระทำ (rule-based ไม่ใช้ LLM): ตั้ง watch → preference "เกณฑ์<เมตริก>ของคุณคือ X"; ส่ง handoff → responsibility "เรื่อง<เมตริก><ขอบเขต> ส่งให้<ชื่อ>"; ปิด alert ว่าไม่เกี่ยว → preference "ไม่ติดตาม<เมตริก><ขอบเขต>" (`rememberAction`) — `suggestOwner` ใช้คนที่ **รับ/ปิด** เรื่องเมตริก+ภาคเดียวกันจากผู้ใช้คนนี้ ≥ 2 ครั้งก่อน RACI (นับแค่ "ส่งถึง" ไม่พอ: `.data` มี packet ค้าง 69 ใบจากการทดลองที่จะทำให้ทุกเรื่องไปหาคนเดียว)
- [x] ตรวจ: เทสต์ `lib/server/outcomes.test.ts` (จริง → resolved + บทเรียน, noise → ปิดทุกคน, คนที่รับเรื่องบ่อยมาก่อน RACI เฉพาะภาคเดียวกัน, ถูกตีกลับไม่นับ); API ปิดงานที่มี alert โดยไม่เลือกได้ 400
- [x] ข้อมูลเดโมของวงจรนี้ (`lib/server/demo-story.ts` `ensureDemoStory`, เรียกจาก `bun run seed`; `bun run seed -- --story` เติมอย่างเดียวไม่ล้าง `.data`, รันซ้ำไม่ซ้ำ): คุณอนุชาส่งงาน "อุบลศรีสุข เทรดดิ้ง แทบไม่สั่งสินค้า" แนบ alert P1 −80% ถึงคุณกฤต + ผลปิดงานเก่า (เป็นเรื่องจริง: ติดวงเงินเครดิต, คุณกฤต, 12 มิ.ย. 2569) บน slice เดียวกัน · ดูด้วยตาที่ 1280: คุณกฤตเห็นปุ่ม "ปิดงาน · เป็นเรื่องจริง / ไม่ใช่ปัญหา" ในงานที่ส่งมา และบรรทัด "ครั้งก่อน" ในแท็บความผิดปกติ; คุณอนุชาเห็นบรรทัดเดียวกันบนการ์ดหน้าแรก

**4D.1 ความจำที่ไม่บวม** (user report 2026-09-23: คุณธนามี 247 ข้อ ส่วนใหญ่คือประโยคเดิมที่เขียนต่างกัน; "ปรับให้ฉลาดระดับ saas") (`lib/engine/memory.ts`, `memory-match.ts`, `memory-review.ts`, `memory-status.ts`, `lib/server/threads.ts`, `components/account/sheet.tsx`)
- [x] เรียนจากคำถามที่ใหม่ในการบันทึกครั้งนั้นเท่านั้น (`recordNewTurns`) — เดิมอ่าน 3 คำถามล่าสุดทุกครั้งที่บันทึก คำถามเดียวถูกสกัดซ้ำหลายรอบ
- [x] ไม่ซ้ำ: โมเดลเห็นสิ่งที่จำไว้แล้ว (fenced, รหัสสั้น) และตอบ `sameAs` แทนการเขียนใหม่; โค้ดกันอีกชั้นด้วย trigram Dice ≥ 0.4 หลังตัดคำเติม โดยไม่รวมข้อที่พูดถึงเมตริกต่างกันหรือคำในเครื่องหมายคำพูดต่างกัน (ขายเข้า ≠ ขายออก, "volume" ≠ "ขายเข้า")
- [x] เรียนรู้ก่อนเชื่อ: ได้ยินครั้งเดียว = กำลังเรียนรู้ (0.45, หายใน 14 วัน, ไม่เข้า prompt); ได้ยินซ้ำหรือมาจากการกระทำ = รู้แล้ว (≥ 0.6, 90 วัน); ผู้ใช้กด "ใช่ จำไว้" = ยืนยัน (ไม่หมดอายุ) · เพดานต่อคน: เชื่อแล้ว 30 ข้อ (ตามความแน่ใจ) + กำลังเรียนรู้ 10 ข้อ (ตามที่เห็นล่าสุด)
- [x] จัดระเบียบ: `consolidateMemory` (กฎ, นับหลักฐานเฉพาะบทสนทนาอื่น) และ `reviewMemory` (โมเดลรวมถ้อยคำ + ทิ้งหน้าที่ที่เดาและเรื่องของตัวระบบ; ไม่แตะข้อที่ยืนยันหรือมาจากการกระทำ) — รันเองเมื่อที่เชื่อแล้วเต็ม วันละครั้ง, หรือ `bun run memory:tidy [-- --review]` · ข้อมูลจริง: คุณธนา 247 → 27, คุณอนุชา 44 → 9
- [x] `recall_memory` ค้นด้วยความคล้าย ไม่ใช่ substring และบอกสถานะ; บัญชีแสดงกลุ่ม "กำลังเรียนรู้" แยก พร้อมปุ่มยืนยัน (`PATCH /api/memory/:id`) · เทสต์ `lib/engine/memory.test.ts` (8)

- [x] หน้า `/memory` แยกจากแผงบัญชี (user decision 2026-09-23: แผงยาวเกินไป): เรื่องที่กำลังเรียนรู้เป็นการ์ด "ใช่ จำไว้ / ไม่ใช่" ด้านบน · เรื่องที่รู้แล้วค้นหาได้ กรองตามประเภท แสดงเต็มข้อความ + "เห็น N ครั้ง · ล่าสุด…" / "คุณยืนยันแล้ว" / "จากสิ่งที่คุณทำ" + ลิงก์ไปบทสนทนาต้นทาง · แก้ถ้อยคำเอง (= ยืนยัน) และลบ · ล้างทั้งหมดยืนยันในหน้า (`DELETE /api/memory`, `PATCH /api/memory/:id { value }`) · แผงบัญชีเหลือสรุป 1 บรรทัด + 3 เรื่องล่าสุด + "มี N เรื่องรอให้คุณยืนยัน" · `MemoryFact` เพิ่ม `seen`, `lastSeenAt` (ข้อมูลเก่าประมาณจากความแน่ใจ)

**4E วัดว่าคนใช้จริงไหม** (`lib/server/usage.ts`, `app/(app)/admin/page.tsx`)
- [x] แท็บการใช้งานเพิ่ม "ใช้จริงไหม" (`lib/server/adoption.ts`, pure `adoptionOf` มีเทสต์): ผู้ใช้ที่ใช้จริงต่อสัปดาห์แยกบทบาท; alert ที่ถูกเปิด / ส่งต่อ / ปิด / ไม่มีใครแตะ (%); handoff ที่ปิดได้ / ตีกลับ และเวลากลางถึงการตอบกลับครั้งแรก; (เวลาจาก alert ถึงการกระทำยังวัดไม่ได้ — เวลา alert เป็นปฏิทินข้อมูล) การ์ดแดชบอร์ดที่ถูกดูใน 14 วัน (%); watch ที่ใช้งานอยู่และจำนวนที่เตือน
- [x] `eval:cards` แสดง token และค่าใช้จ่ายที่ OpenRouter เรียกเก็บจริงต่อ case + รวม (`lib/server/usage-meter.ts` middleware, `usage: { include: true }`) — ~$0.03/case
- [x] เกณฑ์หยุด (เขียนใน `docs/pilot.md`): pilot 6 สัปดาห์กับ RSM / พนักงานขาย / supply planner; ถ้า alert ที่ถูกเปิดหรือส่งต่อ < 30% หรือผู้ใช้ต่อสัปดาห์ < 50% ของกลุ่ม pilot ในสัปดาห์ที่ 4 → หยุดขยาย แก้หรือตัดฟีเจอร์ก่อน

**4F ตรวจหลัง Phase 4** (`lib/engine/anomaly.ts`, `lib/dashboard/templates.ts`, `lib/server/dashboard.ts`, `lib/data/query.ts`, `lib/cards/present.ts`, `lib/eval/check-cards.ts`, `components/chrome/app-chrome.tsx`)
- [x] รวม alert เรื่องเดียวกัน: `mergeAgentStories` (หลัง `dropRollUps`) รวม detection ของเอเย่นต์เดียวกัน เมตริกเดียวกัน ทิศเดียวกัน (ระดับแบรนด์ ไม่รวมระดับ SKU) เป็น alert เดียว — dims เหลือ agent + region, จริง/คาดรวมกันทุกแบรนด์, severity แย่สุด, หน้าต่างเวลากว้างสุด, สมมติฐานสร้างใหม่จาก dims ที่รวมแล้ว, id ใหม่คงที่ต่อ agent+ทิศ · RSM อีสาน วิกฤต 5 → 3 (อุบลศรีสุข −80%, อีสานรุ่งโรจน์ −77%, ส.รุ่งเรือง ลีโอ 620) · ทั้งระบบ 44 → 42 · เทสต์ 2 ข้อใน `anomaly.test.ts`
- [x] การ์ดสต๊อกไม่เฉลี่ยซ่อนของหมด: template `cover` (RSM) / `cover_dc` (supply) เป็น dims ดีซี × SKU ชื่อ "สินค้าที่สต๊อกพอขายน้อยที่สุด…"; `query_metric` เรียงวันครอบคลุมสต๊อกจากน้อยไปมาก (`RISK_WHEN_LOW`) ทั้งแถว, top และ summary ("ต่ำสุด:"); layout ที่เก็บไว้รับ query/ชื่อใหม่ของการ์ด template ตอนอ่าน (`withTemplateReasons`); ป้ายดีซีย่อเป็น "ดีซี<จังหวัด>" ใน `labelOf` · KPI supply "ต่ำสุด ดีซีลำพูน · เพอร์ร่า ขวด PET 600 มล. 6.0 วัน" (เดิม "สงขลา 13.5"), RSM อีสาน "ต่ำสุด ดีซีนครราชสีมา · เพอร์ร่า … 7.7 วัน"
- [x] `eval:cards` เต็มชุดกับ `google/gemini-3.8-flash`: 20/22 ($0.6542, 55 calls) — `planner-cover` ใช้ AlertsCard (summary ยังบอก "สูงสุด" ขัดกับแถว → แก้), `planner-forecast` grounded false positive ปี พ.ศ. ของวันนี้ (→ checker รับปีของ `TODAY`) · รันสองเคสซ้ำ: 7/7 + 2/2 ($0.0832)
- [x] หน้าแรกดูด้วยตา (1280): HR (คุณเมย์) KPI 3 ใบ ไม่มี alert, marketing (คุณเบญ) KPI 4 + alert 2 ใบพร้อมปุ่มส่งงาน, finance (คุณมิ้นท์) KPI 4 + AR ภาคใต้ วิกฤต, IT (คุณต้น) ไม่มี KPI (ไม่มีเมตริกธุรกิจ) chip รัน job / การใช้งานเครื่องมือ — ไม่มี error · เจอและแก้: avatar ตัวอักษรแรกเป็นสระนำ ("เ" ของเมย์/เบญ) → เปลี่ยนเป็นไอคอน `UserRound` ตามที่ผู้ใช้ขอ

**4G ชิปคำถามต่อจากผลของการ์ด (rule-based)** (user decision 2026-09-23: "ทำแบบกฎก่อนเลย"; ขั้นต่อไปที่ยังไม่ทำ: ให้โมเดลเลือก id จากรายการที่กฎสร้าง) (`lib/engine/follow-ups.ts`, `lib/server/next-actions.ts`, `lib/server/agent/tools.ts`, `components/chat/follow-ups.ts`, `components/chat/session-chat.tsx`)
- [x] `followUpsFor` สร้างคำถามต่อจากรูปของผล ไม่ใช้โมเดล มี 6 แบบ: ทำไม<แถวแย่สุด> (`weakestRow` ?? `sharpestHarm` ≥ 5%) · ดู<ชั้นลูก>ใน<แถวนั้น> (ภาค→เอเย่นต์/DC/โรงงาน, แบรนด์→SKU, DC→SKU, กลุ่มธุรกิจ→แบรนด์) · แยกตาม<มิติ> (ตัวเลขเดียว ข้ามมิติที่การ์ดเสนอแล้ว) · แนวโน้มรายสัปดาห์/รายเดือน (เมื่อยอดตกเป็น "เริ่มแย่ตั้งแต่เมื่อไร") · เทียบปีก่อน (ไม่เสนอกับเป้าหรือเมื่อเทียบปีก่อนอยู่แล้ว) · พยากรณ์ 8 สัปดาห์ / "จะถึงเป้าไหม" (เฉพาะเมตริกที่ engine พยากรณ์ และมีสิทธิ์ `get_forecast`)
- [x] คะแนน = ฐานของแต่ละแบบ + บวกเพิ่มเมื่อผลแย่ (ตก ≥ 5% หรือมีแถวที่ตกแรง) + 0.3 × สัดส่วนที่ผู้ใช้คนนี้กดแบบนั้นใน 30 วัน (event ใหม่ `follow_up`, intentKey `follow|<kind>`, recommender ไม่นับเป็น intent) · เอาสูงสุด 3 · ตัดคำถามที่ปุ่มบนการ์ด (`nextActions`) มีแล้ว
- [x] `query_metric` คืน `followUps` คู่กับ `nextActions`; chat แสดงชิปคำถามต่อของการ์ดล่าสุดก่อน แล้วเติมชิปที่เรียนรู้จากประวัติจนครบ 3 · `spaceLatinTh` เว้นวรรคระหว่างไทยกับคำอังกฤษบนชิป
- [x] ตรวจ: เทสต์ `lib/engine/follow-ups.test.ts` + `components/chat/follow-ups.test.ts`; `POST /api/chat` (mock, คุณอนุชา "เอเย่นต์รายไหนยอดตกบ้าง") คืน ทำไมอุบลศรีสุข เทรดดิ้ง / เริ่มแย่ตั้งแต่เมื่อไร / พยากรณ์ 8 สัปดาห์
- [x] (2026-09-25) ดูในเบราว์เซอร์กับ Gemini แล้ว: การ์ด query_metric มีชิปคำถามต่อ ไม่มี error จาก output ที่ยาวขึ้น · `eval:cards` ไม่ได้รัน (ผู้ใช้: เฉพาะตอนจำเป็น)

**4H การ์ดความผิดปกติอ่านได้ในแวบเดียว** (user review 2026-09-23: "ต้องอ่านเยอะและตัวเลขก็เล็ก") (`lib/cards/present.ts`, `components/cards/signal-list.tsx`, `lib/dashboard/widget-to-spec.ts`, `lib/cards/catalog.ts`)
- [x] แต่ละแถวเป็น `SignalItem`: ชื่อ (ตัวหนา) · ที่/เมตริก · "จริง X · คาด Y" (YoY แสดงแค่ "1.7 เท่าของปีก่อน") · % ห่างเป็นตัวเลขใหญ่ มีเครื่องหมาย สีตามว่าดีหรือแย่ต่อเมตริกนั้น (`toneOf`) · ความรุนแรงเป็นแถบสีด้านซ้ายแทนข้อความ "ต้องรีบดู" ซ้ำทุกแถว · สมมติฐานซ่อนหลัง "ทำไม" (`<details>`)
- [x] ทั้งแชต (`CardBodyView`) และ dashboard (spec `SignalList` ใน Cop catalog) ใช้ component เดียวกัน · เทสต์ spec ของ dashboard ตรวจกับ `copCatalog` แทน catalog ของ Vexa (catalog ที่ใช้จริง) · `lib/cards/signals.test.ts` · ดูด้วยตาที่ 1280 และ 400

ทุก package จบด้วย `bun run typecheck`, `bun run test`, curl หน้าที่เปลี่ยน และ mark checkbox ที่นี่

### Phase 5 — ข้อมูลที่มีแต่บริษัทเบียร์ (user decision 2026-09-23: "เขียนลง plan แล้วทำข้อ 1 กับ 2 เลย")

ที่มา: ค้นข้อมูลสาธารณะของบุญรอด (โรงเบียร์ 3 + โรงโซดา/น้ำ 7, เอเย่นต์ ~300 ราย, ตลาดเบียร์ ~2–2.2 พันล้านลิตร/ปี บุญรอด 57–63% ช้าง ~32% คาราบาวเข้าตลาด 2567 ตั้งเป้า ~10%, พ.ร.บ.ควบคุมเครื่องดื่มแอลกอฮอล์ (ฉบับที่ 2) พ.ศ. 2568 มีผล 8 พ.ย. 2568) เทียบกับ mock ตอนนี้ที่เป็นบริษัทเครื่องดื่มทั่วไป: ไม่มีคู่แข่ง ไม่มีวันห้ามขาย เอเย่นต์ 43 ราย มี Carlsberg ซึ่งไม่ใช่ของบุญรอด ลำดับที่เสนอ: (1) ส่วนแบ่งตลาดเทียบคู่แข่ง (2) ปฏิทินวันห้ามขาย/เทศกาล (3) ขวดและลังคืน (4) ติดตามการเปิดตัว Singha Sparkling Water (5) ตรวจเนื้อหาการตลาดตาม พ.ร.บ. (6) route-to-market 300 เอเย่นต์ → ซับเอเย่นต์ → ร้าน — ทำ 1 กับ 2 ก่อน เพราะใช้ engine เดิม (semantic layer + anomaly) ไม่ต้องแตะชั้นสิทธิ์ใหม่

**5A ส่วนแบ่งตลาดเบียร์เทียบคู่แข่ง** (`lib/data/entities/market.ts` ใหม่, `lib/data/generator.ts`, `lib/data/cache.ts`, `lib/data/query.ts`, `lib/semantic/metrics.ts`, `lib/semantic/dictionary.ts`, `lib/contracts/semantic.ts`, `lib/access/policies.ts`, `lib/access/raci.ts`, `lib/engine/watches.ts`, `lib/engine/hypothesis.ts`, `lib/server/mock-script.ts`)
- [x] มิติใหม่ `maker` (ผู้ผลิต): บุญรอดบริวเวอรี่ / ไทยเบฟ / คาราบาว / อื่น ๆ; ชื่อแบรนด์ของแต่ละรายเป็นคำค้น (ช้าง, คาราบาว, ตะวันแดง)
- [x] ข้อมูลแบบ retail audit รายเดือนต่อจังหวัด (`lib/data/market-share.ts`) ถึงเดือนที่ครบล่าสุด (ส.ค. 2569): ลิตรของบุญรอด = ยอดขายออกเบียร์ของเราในจังหวัดนั้น (ตัวเลขสอดคล้องกับเมตริกขายออก) ตลาดทั้งหมด = ลิตรของเรา ÷ ส่วนแบ่งของเรา; ส่วนแบ่งตั้งต้นต่างกันตามภาค คาราบาวโตช้า ๆ ตั้งแต่ 2567
- [x] เรื่องที่ฝังไว้: คาราบาวบุกนครราชสีมา มิ.ย.–ส.ค. 2569 (คาราบาว 6.5% → 13.1% เทียบ ส.ค. ปีก่อน, ส่วนแบ่งเรา 57.7% −10.4% เทียบปีก่อน) ทั้งที่ยอดขายออกเบียร์ของเราที่นั่นยังโต +7.9% — ตลาดโตเร็วกว่า
- [x] เมตริก `market_share` (%, ratio = ลิตรผู้ผลิต ÷ ลิตรตลาด) มิติ month/region/province/maker, ถ้าไม่ได้ขอมิติหรือกรอง maker → กรองเป็นบุญรอดให้เอง (ส่วนแบ่งรวมทุกรายเท่ากับ 100% ไม่มีความหมาย); เห็นได้: CEO/CFO/ผอ.ขาย/RSM และพนักงานขาย (ภาคตัวเอง)/การตลาด; เจ้าของตาม RACI = RSM ของภาค
- [x] watch `share_province` (`SHARE_SCAN`: ฐาน 6 เดือน หน้าต่างได้ถึง 3 เดือน พื้น sigma 0.8%) → P1 ถึงคุณอนุชา "คาราบาวได้ส่วนแบ่งเพิ่ม 4.1 จุด ... ของเราลดลง 3.5 จุด"; ความรุนแรงของเมตริก % นับเป็นจุด (≥3 = P1, ≥1.5 = P2) และช่องว่างบนการ์ด alert ของเมตริก % แสดงเป็น "จุด"; ถ้าแยกตาม maker หัวการ์ดเป็นส่วนแบ่งของเรา ไม่ใช่ค่าเฉลี่ยทุกราย
- [x] mock turn "ส่วนแบ่งตลาดเทียบคู่แข่ง" (ไม่ระบุจังหวัด → รายจังหวัด, ระบุจังหวัด → ทุกผู้ผลิตในจังหวัดนั้น, ส.ค. เทียบปีก่อน) + turn "ยอดขายออกเบียร์ของเราใน<จังหวัด>เทียบปีก่อน" (ขั้นตรวจของ alert); ชิปตั้งต้นให้ CEO/ผอ.ขาย/RSM/การตลาด · เทสต์ `lib/engine/beer-market.test.ts`
- ยังไม่ทำ: ส่วนต่างเป็น "จุด" แทน % สัมพัทธ์บนการ์ด (ทั้งระบบใช้ % สัมพัทธ์อยู่ เปลี่ยนเฉพาะเมตริก % ต้องแตะ presenter), แผนที่รายจังหวัด

**5B ปฏิทินวันห้ามขาย เทศกาล และผลต่อยอดขาย** (`lib/data/entities/calendar.ts`, `lib/data/generator.ts`, `lib/engine/anomaly.ts`, `lib/engine/hypothesis.ts`, tool ใหม่ `get_calendar` ใน `lib/server/agent/tools.ts` + `lib/contracts/tools.ts`, `lib/server/mock-script.ts`)
- [x] แก้วันที่ปี 2569 (ปีอธิกมาส): อาสาฬหบูชา 29 ก.ค., เข้าพรรษา 30 ก.ค., ออกพรรษา 26 ต.ค. (ไฟล์เดิมใส่ 29–30 มิ.ย. และจบพรรษา 26 ก.ย.) เพิ่มออกพรรษา 2568 (7 ต.ค.) และลอยกระทง 2569
- [x] วันห้ามขายเครื่องดื่มแอลกอฮอล์ (มาฆะ วิสาขะ อาสาฬหะ เข้าพรรษา ออกพรรษา) เป็นข้อมูลแยกจากวันหยุด (`ALCOHOL_BAN_DATES`); generator: ขายออกเบียร์วันนั้นเหลือราว 10% เอเย่นต์สั่งเข้าล่วงหน้า 1–2 วัน วันนั้นเกือบไม่สั่ง; น้ำ/โซดาไม่กระทบ
- [x] anomaly รู้ปฏิทิน (เปลี่ยนจากแผนเดิมที่จะแค่ลดความรุนแรง): วันห้ามขายและ 2 วันก่อนหน้าไม่ถูกนับในค่าฐานและอ่านเป็น "ตามคาด" ในหน้าต่างที่ตรวจ (`SkipMask` ใน `stats.ts`) จึงไม่ปลุกใครเพราะวันพระ; วันเบียร์ที่อยู่คนละฝั่งของจุดเริ่ม/จบพรรษาถูกปรับระดับด้วยผลของพรรษาที่วัดจากปีก่อนเทียบน้ำ/โซดา (0.83 ใกล้ค่าจริง 0.82) — เพราะพรรษา 2569 เริ่ม 30 ก.ค. อยู่กลางค่าฐาน 56 วัน ถ้าไม่ปรับ เส้นแนวโน้มเอียงลงแล้วเรื่องบุรีรัมย์หาย และเกิด alert ปลอม ~10% ทั่วประเทศ
- [x] tool `get_calendar { from, to }` (อ่านอย่างเดียว ทุกบทบาท): รายการวันห้ามขาย/วันหยุด/เทศกาลในช่วง พร้อมผลครั้งก่อนที่วัดจากข้อมูลจริง (ขายออกเบียร์วันห้ามขายครั้งล่าสุดเทียบวันปกติ %, สงกรานต์เทียบค่าปกติ %) → การ์ด Timeline
- [x] เรื่องเดโมที่ 5 บน `/login` "คาราบาวบุกโคราช กับวันห้ามขายที่กำลังมา" (คุณอนุชา → คุณวีร์) + ฉากที่ 4 ใน `docs/demo.md`
- [x] mock turn "เดือนหน้ามีวันไหนที่กระทบยอดขาย" → "วันออกพรรษา 26 ต.ค. 2569 (อีก 34 วัน) ครั้งก่อน ขายออกเบียร์ −90% · เอเย่นต์สั่งเข้า 2 วันก่อนหน้า +29%" (วัดจากวันวิสาขบูชา 31 พ.ค. เพราะอาสาฬหะ/เข้าพรรษาติดกันและติดวันเฉลิมฯ) + ชิปตั้งต้นให้ RSM/พนักงานขาย/ซัพพลาย
- ตรวจ: typecheck, 364 tests, `/api/chat` (mock) ทั้งสาม turn ในฐานะคุณอนุชา, หน้าแรกคุณอนุชามีการ์ด alert ส่วนแบ่งโคราช, รัน anomaly + forecast ใหม่แล้ว (alert 45 รายการ) · ยังไม่รัน `eval:cards` กับ Gemini และยังไม่ดูด้วยตาในเบราว์เซอร์ · ชิปตั้งต้นใหม่ไม่ขึ้นสำหรับผู้ใช้ที่มีประวัติแล้ว (ตามการออกแบบ: ประวัติมาก่อน)
- ยังไม่ทำ: ให้พยากรณ์ปรับตามวันห้ามขายในอนาคต, ข้อมูลนักท่องเที่ยวรายภาค, เตือนล่วงหน้าในสรุปตอนเช้า

**5C หน้าต่างเทียบที่ตรงกับคำถาม** (`lib/data/query.ts`, `lib/data/compare.test.ts`; ที่มา: ผู้ใช้ตรวจแชท AR ภาคใต้ 2026-09-23 เจอ "เทียบปีก่อน −8.4%" ที่จริง +69.8%)
- [x] `priorWindow` ตัดสินจากช่วงเวลาอย่างเดียว ไม่ขึ้นกับ dims/grain: เต็มเดือน → เดือนปฏิทินก่อนหน้า/เดือนเดียวกันปีก่อน; เดือนนี้ถึงวันนี้ → ตัดที่วันเดียวกัน; ช่วงอื่น → ถอยเท่าความยาว (ปีก่อน 364 วัน); เมตริกรายเดือน (ไม่มีแกน week) → เดือนเต็มเสมอ; ช่วงก่อนที่เริ่มก่อนข้อมูล → ไม่มีค่าเทียบ
- [x] แถว top-N ใช้ค่าเทียบจากช่วงก่อนทั้งหมด (ไม่ตัด limit แยก) · headline ของสต๊อก/วันครอบคลุมใช้ช่วงเวลาสุดท้าย · SOV ใช้สัปดาห์ที่วันกลางอยู่ในช่วง
- [x] `compare.test.ts`: oracle ปฏิทินเขียนแยกจาก engine ตรวจทุกเมตริก (ยกเว้นแคมเปญ 4 ตัวที่ข้อมูลเบาบาง) × 10 ช่วง × 2 compare; headline ไม่ขยับตาม dims/grain/limit; RSM เทียบในขอบเขต (probe ก่อนแก้เจอ 565 จุด หลังแก้ 0)
- [x] เคส `eval:cards` กับ Gemini 4 เคส `compare-*` + check `comparedRight` (tool input มี compare และช่วงที่คาด; `to` เกินข้อมูลนับเป็น TODAY เหมือน engine) — 4/4 ผ่าน, เดือนนี้ −11.5% ตรงกับ 1–22 ก.ย. เทียบ 1–22 ส.ค.
- [x] Δ แสดงทศนิยมเดียวเสมอ ("−39.0%") ที่ `formatDelta`; ชิปการเปลี่ยนแปลงบน dashboard ใช้ `formatDelta` ด้วย
- พบ: `ctx.today` ใน persona มาจากนาฬิกาจริงของ Vexa (23 ก.ย.) ขณะที่ข้อมูลจบ 22 ก.ย. → โมเดลส่ง `to` = 23 และหัวการ์ดเขียน "– 23 ก.ย." (ตัวเลขถูกเพราะ engine ตัดที่ TODAY)

**5D การ์ดที่วาดได้ตามรูปของข้อมูล** (user decision 2026-09-23: "ทำเลยแต่ต้องดีกว่าเดิม แล้วพวก pie/donut, stacked bar, area, heatmap, map, scatter, funnel ล่ะ") (`lib/cards/present.ts`, `components/cards/charts/*` ใหม่, `components/cards/card-parts.tsx`, `components/cards/data-card.tsx`, `lib/dashboard/widget-to-spec.ts`, `lib/cards/catalog.ts`, `lib/contracts/dashboard.ts`, `lib/server/agent/persona.ts`, `lib/server/mock-script.ts`, `scripts/eval-cards.ts`)

ที่มา: การ์ดออกได้ ~6 แบบ เพราะ `viewFor` ดูแค่ "มีเวลาไหม / กี่แถว" และ `lineBody` ต่อทุกแถวเป็นเส้นเดียว — "ยอดรายเดือนแยกภาค" ได้เส้นเดียวที่กระโดดไปมาระหว่างภาค (อ่านผิดได้ ไม่ใช่แค่ไม่สวย) หลักเดิมยังอยู่: โมเดลเลือกการ์ดและผูกผล tool, Cop ตัดสินรูปจากรูปของข้อมูลในตารางเดียว ทั้ง dashboard และแชทได้พร้อมกัน ทุกตัวเลขมาจากแถวของ tool

ตารางตัดสิน (auto) — สัญญาณที่ใช้: มิติเวลา, จำนวนมิติกลุ่ม, จำนวนกลุ่ม, `headline.aggregate` (`sum` = บวกข้ามกลุ่มได้), มิติเป็นภูมิศาสตร์หรือเป็น "ส่วนของทั้งหมด", `sortBy`, และผลที่สองจาก `with`
- เวลา × กลุ่ม, บวกได้ → **stacked bar** (≤ 12 ช่วง) / **stacked area** (> 12 ช่วง); กลุ่มเกิน 5 → 4 อันดับแรก + "อื่น ๆ"
- เวลา × กลุ่ม, บวกไม่ได้ (%, เฉลี่ย, วัน) → **เส้นหลายเส้น** (≤ 5 กลุ่ม) / **heatmap** กลุ่ม × เวลา (> 5 กลุ่ม)
- สองมิติกลุ่ม (เช่น ภาค × ช่องทาง, จังหวัด × ผู้ผลิต) → **heatmap**; มีค่าเทียบ → สีตาม Δ (เขียว/แดงตามทิศที่ดีของเมตริก) ไม่มี → สีตามค่า
- จังหวัด / ภาค → แถบจัดอันดับ (แผนที่ไทยแบบ tile ทำแล้วเอาออก — user 2026-09-23 "เอา map ออก": 4 จังหวัดของ RSM เป็นแผนที่ไม่บอกอะไรเพิ่ม สีเทาทั้งหมดเมื่อเปลี่ยน < 2% และซ้ำกับรายการข้างๆ)
- ส่วนของทั้งหมด (ช่องทาง, กลุ่มธุรกิจ, แพ็ก, ผู้ผลิต) 2–6 กลุ่ม บวกได้หรือเป็นส่วนแบ่งตลาด และไม่ได้ถามว่าอะไรตก/โต → **donut**; ถามเรื่อง Δ → แถบจัดอันดับเหมือนเดิม
- `with` (ผล `query_metric` ครั้งที่ 2–4 ในเทิร์นเดียวกัน): มิติกลุ่มเดียวกัน ≥ 4 จุด → **scatter** (x = เมตริกแรก, y = เมตริกที่สอง, เส้นมัธยฐาน, ชื่อจุดสุดโต่ง); ไม่มีมิติ หน่วยเดียวกัน → **funnel** ตามลำดับที่ส่ง (เช่น ผลิต → ขายเข้า → ขายออก, ส่วนที่หายระหว่างขั้น); อนุกรมเวลาเดียวกัน → เส้นทับกัน (หน่วยต่างกัน → ดัชนี งวดแรก = 100)
- `view` ที่โมเดลขอแต่ข้อมูลวาดไม่ได้ (เช่นขอ donut ของค่าเฉลี่ย) → ตกกลับไปที่ auto ไม่วาดผิดรูป

- [x] สัญญา `CardBody` ใหม่ (`stacked`, `share`, `heatmap`, `scatter`, `funnel`, `line` หลาย series) + `viewFor` ใหม่ + `others` ใน `PresentInput` (`lib/cards/chart-bodies.ts`, `lib/cards/rows.ts`)
- [x] React: `components/cards/charts/*` วาดจาก body ที่ presenter คำนวณไว้แล้ว (สี = token ผสมกับ `card`) · dashboard ใช้ element `CardBody` ตัวเดียว (อยู่ใน catalog แบบ "ห้ามเขียนเอง")
- [x] `DataCard.with` ใน catalog + persona · `WidgetKind` เพิ่ม `share`, `stacked`, `area`, `heatmap` · ปักจากแชทเก็บ kind ที่วาดจริง (`widgetKindFor`) · widget ของ template รีเฟรช kind จาก template
- [x] เทสต์ตารางตัดสินด้วยแถวจริงจาก engine (`lib/cards/present.test.ts`) · mock turn + เคส `eval:cards` `shape-*` + check `drewShape` (presenter รันซ้ำบนผลที่การ์ดผูก)
- [x] ตรวจด้วยตาในเบราว์เซอร์: แชท (Gemini จริง) ทุกรูป, dashboard (คุณวิชัย, คุณอนุชา), dark, จอ 390px ไม่มี scroll แนวนอน
- พบระหว่างตรวจแล้วแก้: scope line นับแถวแทนกลุ่ม ("36 ภาค"), heatmap โหมด Δ ต้องเขียน Δ ไม่ใช่ค่า, scatter เส้นทแยงเฉพาะหน่วยเดียวกันและขนาดใกล้กัน (≤ 3 เท่า) ไม่งั้นจุดกองที่พื้น, ป้ายขั้น funnel ตัดวงเล็บ, prompt: `description` = null เป็นปกติ
- [x] ตารางกลายเป็นแถบจัดอันดับ (user 2026-09-23: "Table ดูยากเข้าใจยากกว่าแบบที่มี bar"): `table`/`kv` ของรายการแยกกลุ่ม ≥ 2 แถว → rank; heatmap สองมิติต้องเต็ม ≥ 60% ของตาราง ไม่งั้น rank; ยังเป็นตาราง: อนุกรมเวลาที่ขอเป็นตาราง, ข้อมูลที่ถูกปิดตามสิทธิ์
- [x] เรียงลำดับครบทาง: `MetricQuery.sort` — engine เรียงก่อนตัด `limit` (เดิมตัดตามยอดก่อน: "10 เอเย่นต์ที่ตกแรงสุด" ส.ค. ผิด 6 จาก 10 ราย) · template "ส่วนแบ่งตลาดตามจังหวัด" = แถบ `delta_asc` · การ์ดใช้ `query.sort` เมื่อไม่ได้ระบุ `sortBy` จึงปักแล้วลำดับไม่หาย · เรียงตาม Δ → แถบยาวตามขนาด Δ · แถว heatmap ตาม `sortBy` · `WidgetSpec.sortBy` (template "เอเย่นต์ที่ยอดตก" = `delta_asc`) · เทสต์ `lib/data/sort.test.ts` · check `cutRight` ใน eval
- ตรวจ: typecheck ผ่าน (ยกเว้น `components/account/sheet.tsx` ของงาน memory ที่ทำคู่ขนาน), 441 tests · eval Gemini รายเคส: shape-* ทั้ง 7, ceo-channel/decline/trend, landing-visit, compare-top-decliners, planner-cover, marketing-campaign, rsm-agents ผ่าน · `cfo-ar` ยังไม่ได้ผล (OpenRouter rate limit) · eval เต็มชุดยังไม่ได้รัน
- ยังไม่ทำ: ในรายการ "อะไรตก" ที่มีตัวที่โตปนอยู่ท้าย แถบของตัวที่โตยาวตามขนาดการโตด้วยสีเดียวกัน (pill บอกทิศ); ส่วนแบ่งตลาดยังแสดง Δ เป็น % สัมพัทธ์ไม่ใช่จุด; ย้าย chart ไป Vexa เป็นของกลาง (ตอนนี้อยู่ใน Cop)

### Phase 6 — แชทที่ประกอบ UI เอง: คน สถานที่ หลักสูตร พร้อมรูป (user decision 2026-09-23: "ตัวอย่างที่จะได้เห็นในฝั่ง HR เยี่ยมมากผมชอบ")

ที่มา: ผู้ใช้อยากเห็นแชทประกอบ UI ที่สวยและมีรูป ตัว renderer ไม่ใช่ปัญหา เพราะ catalog ของ Vexa มี `Image`, `Avatar`, `Carousel`, `Map`, `Timeline`, `Tabs`, `Accordion`, `KeyValue`, `Progress`, `Rating`, `Form`, `Checkbox`, `Callout` อยู่แล้ว สิ่งที่ขาดคือ (1) ข้อมูล: ทุก tool คืนแถว metric แบบรวม ข้อมูลรูปนี้วาดได้แค่ `DataCard` ไม่มี entity ที่มีรูป พิกัด หรือประวัติ และยังไม่มี `public/` (2) กติกา: prompt, eval และ normalizer พาทุกคำตอบไปที่ `DataCard`

หลัก: **สองเส้นทาง** — คำถามเรื่องตัวเลขยังเป็น `DataCard` ที่ผูกผล tool (หลัก "โมเดลเลือก Cop วาด" ของ 1.7 ไม่เปลี่ยน) ส่วนคำถามเรื่องคนหรือสิ่งของใช้ entity tool ที่คืนข้อมูลเป็น record แล้วให้โมเดล**ประกอบ UI เอง**จาก primitive ของ Vexa โดยกฎ grounding ยังคุม: `src` ของรูป ตัวเลข วันที่ และชื่อทุกตัวต้องมาจากผล tool · entity tool คืนแถวไม่เกิน 12 แถว พร้อม label ที่จัดรูปแล้ว · ข้อมูลรายคนผ่าน `lib/access` เหมือน metric

**6A ข้อมูล entity และรูป** (`lib/data/entities/people.ts` ใหม่, `lib/data/entities/sites.ts` ใหม่, `lib/data/entities/courses.ts` ใหม่, `lib/data/generator.ts`, `public/img/**` ใหม่)
- [x] พนักงาน 40 คน รูปละหนึ่งคน (`lib/data/entities/people.ts`): ผู้ใช้ 26 คนเดิม + ทีมขายอีสาน 4 (คุณป้อง หัวหน้าทีมโคราช โอที 118 ชม. ใบอนุญาตหมดใน 16 วัน · คุณจอย ทดลองงาน 2 เดือน) + โรงงานขอนแก่น 4 + ปทุมธานี 2 + HR 4 · ตำแหน่งว่าง 3 · สัญญาณคำนวณใน `lib/engine/people-signals.ts` (ทดลองงาน/ใหม่/โอทีสูง/ใบรับรอง/เกษียณ; ความเสี่ยง = โอที ≥ 90, คนใหม่โอที ≥ 40, ไม่เลื่อนตำแหน่ง ≥ 7 ปี) — ยังไม่มีพิกัดเขต
- [x] ผู้สมัคร 25 คนใน 4 ตำแหน่ง (เพิ่ม `op_ne_khonkaen` พนักงานขาย ขอนแก่น เขตชุมแพ) มีขั้น 5 ขั้น, คะแนนสัมภาษณ์, จุดแข็ง/ข้อกังวล, แหล่งที่มา (`lib/data/entities/recruiting.ts`) · ไม่มีรูป แสดงเป็นอักษรย่อ (ไม่ใช้รูปพนักงานซ้ำ)
- [x] โรงงาน/คลังจาก `PLANTS` เดิมเพิ่ม `photo`, พิกัด, เหตุการณ์ความปลอดภัย 12 เดือน (ฝังเรื่อง: โรงงานขอนแก่นมีเหตุรถยกช่วงเร่งผลิตก่อนออกพรรษา) — ทำใน 6D
- [x] หลักสูตร 10 หลักสูตรพร้อมปก วันเปิด ที่นั่ง และใบรับรองที่ต่ออายุ (`lib/data/entities/courses.ts`) · ระเบียบการลา 5 หัวข้อ + สวัสดิการ 5 หัวข้อ + วันลาที่ใช้ไปต่อคน (`lib/data/entities/policies.ts`)
- [x] รูป Unsplash License 58 รูป 6.1 MB ใน `public/img/{people,sites,courses}` + `credits.json` (คน 40 หน้าชัด วัยทำงาน ไม่ซ้ำชุดถ่าย · โรงงาน/คลัง 8 · ปกหลักสูตร 10) ไม่ hotlink ไม่มีแบรนด์จริง · เทสต์ว่ารูปทุกคนมีจริงและไม่ซ้ำ

**6B entity tools และสิทธิ์** (`lib/server/agent/tools.ts`, `lib/contracts/tools.ts`, `lib/access/policies.ts`, `lib/access/entity-scope.ts` ใหม่)
- [x] `find_people { region, department, manager, query, flag }` + `get_person { id, name }` (`lib/server/people.ts`) คืนแถวที่จัดรูปแล้ว (badges, tenure, facts, history เป็นรูป Timeline) · ทุกบทบาทเรียกได้ · ป้ายใน admin console
- [x] `get_site` (6D) · `list_candidates` (HR, CEO, หัวหน้าที่เปิดตำแหน่งและสายบังคับบัญชาเหนือขึ้นไป — `canSeeCandidates`; เงินเดือนที่คาดหวังตาม `canSeeSalary`; คนอื่นได้ PERMISSION_DENIED) · `list_courses` (ที่นั่งเหลือ, badge "ใบของคุณหมดใน N วัน", note ชื่อลูกทีมที่ใบใกล้หมด) · `get_policy { leave | benefits }` (วันลาคงเหลือของผู้ถาม, ฟอร์ม) · เขียน: `enroll_course`, `request_leave` (needsApproval; เซิร์ฟเวอร์นับวันทำการ ตรวจสิทธิ์และแจ้งล่วงหน้า แล้วส่ง packet เข้า Inbox หัวหน้าผ่าน `createPacket`; คำขอเก็บใน `staff-requests`)
- [x] สิทธิ์ระดับ field (`lib/access/people-scope.ts`): directory (ชื่อ ตำแหน่ง รูป พื้นที่ หัวหน้า) < team (ตัวเอง ลูกทีมตามสายบังคับบัญชา และ CEO: อายุงาน ประวัติ ใบรับรอง โอที) < hr (HR: + อายุ + ความเสี่ยงลาออก) · เงินเดือนผูกกับสิทธิ์ `avg_salary` = full ให้ admin console คุมที่เดียว · บทบาทที่ถูกจำกัดภาคเห็นเฉพาะคนในภาค + ส่วนกลาง · `flag` ใช้แอบถามเรื่องที่ไม่มีสิทธิ์ไม่ได้
- [x] เทสต์ scope ต่อบทบาท `lib/server/people.test.ts` (8 เทสต์)

**6C โมเดลประกอบ UI** (`lib/server/agent/persona.ts`, `lib/cards/normalize.ts`, `lib/eval/cases.ts`, `lib/server/mock-script.ts`, `lib/i18n/th.ts`)
- [x] catalog ของ Cop เพิ่ม `PersonTile` (รูป ชื่อ ตำแหน่ง พื้นที่ · อายุงาน badges กดแล้วถามโปรไฟล์ · จอแคบเป็นแถวแนวนอนด้วย container query `@md/vexa`) และ `ProfileHeader` (`components/cards/people.tsx`) · prompt: ทีม = Card → ProfileHeader หัวหน้า → Grid PersonTile → Callout ตำแหน่งว่าง; โปรไฟล์ = ProfileHeader → KeyValue → KeyValue ใบรับรอง → Timeline → Callout ความเสี่ยง → Avatar ลูกทีม (ใบรับรองเคยเป็น Progress แต่ "4%" อ่านไม่ออก จึงเปลี่ยน)
- [x] รูปแบบของสถานที่ (6D) ผู้สมัคร หลักสูตร และระเบียบ: `CandidateTile` / `CourseTile` (ปุ่มสมัครกด `enroll_course` ผ่าน `usePress`) ใน `Carousel` ที่มี children · `LeaveForm` (ประเภท วันที่ เหตุผล → กด `request_leave`) · ใบลา = Metric ×3 → Accordion → LeaveForm (`components/cards/hr.tsx`)
- [x] normalizer: รูป (`PersonTile`/`ProfileHeader`/`Avatar`/`Carousel`) ที่ tool ไม่ได้ส่งในเทิร์นนั้น → null (แสดงเป็นอักษรย่อ) · `Image` ที่ไม่ได้ส่ง → หายไป
- [x] eval: `people-team`, `people-certs`, `people-profile` (scripted) + `people-rep-scope` · check `composedPeople`, `picturesGrounded` · Gemini: ผ่าน 4/4 เคส แต่ `people-certs` ล้ม 2 จาก 4 รอบด้วย OpenRouter 400 "reasoning details to be preserved" ที่ขั้นที่สอง (เป็น error ของ provider ไม่ใช่การประกอบการ์ด ยังไม่ได้สืบว่าเกิดกับเคสอื่นบ่อยแค่ไหน)
- [x] mock turn ทีม/กรองตาม flag/โปรไฟล์ (`lib/server/mock-people.ts`) + ชิป "ทีมขายภาคอีสานมีใครบ้าง", "ใบอนุญาตของใครใกล้หมดอายุ"
- [x] mock turn ผู้สมัคร/หลักสูตร/ใบลา (`lib/server/mock-hr.ts`) + ชิปของทั้งสาม · กดปุ่มสมัคร/ยื่นใบลาใน mock ผ่าน `PRESSED_DONE` · eval `candidates-khonkaen`, `courses-month`, `policy-leave` (scripted) + `candidates-manager`, `courses-rep` · เทสต์ `lib/server/hr.test.ts` (12)
- ดูด้วยตา (2026-09-24, mock): ผู้สมัครในฐานะคุณเมย์ (light 1280), หลักสูตร (390px), ใบลาและยื่นใบลาถึงการ์ดอนุมัติในฐานะคุณกฤต (dark 390px), คุณกฤตถามผู้สมัครได้คำปฏิเสธไม่มีการ์ด · แก้ที่พบ: อักษรย่อไทยข้ามสระหน้า (เ แ โ ใ ไ), ป้าย "เหลือ N ที่" ซ้ำบรรทัดที่นั่ง, ฟอร์มลาส่งซ้ำได้เมื่อเปลี่ยนค่า

| คำถาม | UI ที่คาด |
|---|---|
| "ทีมขายภาคอีสานมีใครบ้าง" | Avatar หัวหน้า → ลูกทีม, Map ปักเขตที่ดูแล, Badge คนใหม่/เสี่ยงลาออก |
| "ขอดูโปรไฟล์คุณ…" (HR) | รูป, KeyValue, Timeline ประวัติ, Progress ใบรับรองใกล้หมดอายุ |
| "ผู้สมัครพนักงานขายขอนแก่น" | Carousel การ์ดผู้สมัคร, Rating, ขั้นการสรรหา |
| "โรงงานไหนเกิดอุบัติเหตุ" | Map โรงงาน, รูปโรงงาน, Timeline เหตุการณ์, Callout |
| "มีหลักสูตรอะไรเปิดเดือนนี้" | Carousel ภาพปก → ปุ่มสมัคร |
| "ลาพักร้อนยังไง" | Accordion สวัสดิการ → `Form` ยื่นใบลา ผ่าน approval flow เดิม |

**6D โรงงานและความปลอดภัย** (`lib/data/entities/sites.ts`, `lib/engine/site-safety.ts`, `lib/server/sites.ts`, `components/cards/places.tsx`, `lib/server/mock-sites.ts`) — ทำแล้ว 2026-09-24 (user: "ทำต่อได้เลย")
- [x] สถานที่ 6 แห่ง (โรงงาน 3, ศูนย์กระจายสินค้า 2, สำนักงานใหญ่) พร้อมรูป 16:9 ที่ตัดเองให้ไม่มีป้าย/แบรนด์ติด (site01 มีป้าย "POWERHOUSE", site04 มียี่ห้อรถยก HYSTER จึงไม่ใช้) + บันทึกเหตุ 13 รายการ 12 เดือน · เรื่องที่ฝัง: ขอนแก่นรถยกชนพนักงาน 15 ก.ย. (หยุดงาน, ยังไม่ปิด) ช่วงเร่งผลิตก่อนออกพรรษา ซ้ำกับ ต.ค. 2568 · โอทีเฉลี่ย 71 ชม./คน · หัวหน้ากะ (คุณแดง) ใบขับขี่รถยกหมดใน 8 วัน
- [x] `lib/engine/site-safety.ts`: วันนับจากหยุดงานครั้งล่าสุด, 90 วันล่าสุดเทียบ 90 วันก่อนหน้า, เรื่องที่ยังไม่ปิด → สถานะ ต้องดูด่วน/เฝ้าดู/ปกติ · สีของตัวเลขวันผูกกับจำนวนวันเท่านั้น (< 30 แดง, ≥ 180 เขียว)
- [x] tool `get_site { id, name }` (ทุกบทบาท ไม่ระบุชื่อผู้บาดเจ็บ): ไม่ระบุ = ทุกแห่งเรียงที่ต้องดูก่อน; ระบุ = รูป, ตัวเลข 3 ตัว, เรื่องที่ยังไม่ปิด, timeline 12 เดือน, facts, คนในพื้นที่ตามสิทธิ์ของผู้ดู (`peopleAtSite`)
- [x] `PlaceTile` (รูป ตัวเลขวันเป็นตัวใหญ่ badges กดแล้วถามรายละเอียด จอแคบเป็นแนวนอน) · prompt: ภาพรวม = Grid PlaceTile; ที่เดียว = Image banner → Metric ×3 → Callout ยังไม่ปิด → Timeline → KeyValue → PersonTile คนในพื้นที่ · ห้ามเติมรายละเอียดที่ tool ไม่ส่ง (Gemini เคยเติม "อ.เมือง" ใน meta)
- [x] Vexa: `Image.aspect` `banner` 21:9 (§9)
- [x] เทสต์ `lib/server/sites.test.ts` (5) · eval `sites-overview`, `sites-detail` Gemini ผ่าน 5/5 ทั้งคู่ · ดูด้วยตา: ภาพรวมและรายละเอียดขอนแก่นในฐานะ CEO (light กว้าง, dark 390px)
- ยังไม่ทำ: แผนที่ (Vexa `Map` ปักได้จุดเดียวและโชว์พิกัดดิบ ต้องทำใหม่ก่อนใช้), ส่งเรื่องให้ผู้รับผิดชอบจากการ์ดสถานที่

**6F โมเดลออกแบบ UI เองจริง** (user decision 2026-09-24: "ลบทั้งหมด ยกเว้น LeaveForm นอกนั้นให้ Gemini ประกอบเอง") — tile ของ Cop ทำให้ Gemini แค่เติมฟิลด์ลงแม่แบบ ไม่ได้ออกแบบเอง
- [x] ลบ `PersonTile`, `ProfileHeader`, `PlaceTile`, `CandidateTile`, `CourseTile` (catalog, registry, `components/cards/{people,places,hr}.tsx`) · เหลือ `LeaveForm` (`components/cards/leave-form.tsx`) เพราะเป็นฟอร์มที่ส่งคำขอเข้า approval ซึ่ง Cop ควรคุมเอง
- [x] prompt เปลี่ยนจากผังตายตัวเป็นหลักการ: เลือก tool ตามเรื่อง · หนึ่ง Card ต่อคำตอบ ห้ามซ้อน · สิ่งที่ต้องตัดสินใจขึ้นก่อน · หลายรายการใช้ Grid หรือ Carousel ที่มี children เป็น Stack · เลือก Avatar/Image/Badge/Metric/Rating/Progress/Timeline/KeyValue/Accordion/Callout เอง · ปุ่มเป็น Vexa `Button` + `runTool` (`get_person`, `get_site`, `enroll_course`) ด้วย id จาก tool · ตัวเลข รูป ชื่อ วันที่ มาจาก tool
- [x] tool ส่งตัวเลขที่ UI ต้องใช้มาให้ครบ (`stage_percent` ของผู้สมัคร) — check `grounded` จับได้ตอน mock คำนวณ Progress เอง
- [x] eval: `composedPeople` = มี Card + component ของ Vexa และไม่มี DataCard · `picturesGrounded` นับรูปใน Carousel items ด้วย · ใหม่ `pressBound` (ทีม → `get_person`, สถานที่ → `get_site`, หลักสูตร → `enroll_course`) · mock ประกอบจาก primitive ผ่าน `lib/server/mock-compose.ts` · `grounded` เทียบตัวเลขแบบค่า (4.0 = 4)
- ผล Gemini: 11 เคส × 2 รอบผ่านครบ (รอบแรกล้ม 4: 429 สองครั้ง, "4.0" สองครั้ง) · ดูด้วยตา: หลักสูตร (คุณกฤต) Gemini คัดมาแค่ 3 หลักสูตรที่เกี่ยวกับพนักงานขาย + Callout ใบอนุญาต + ปุ่มสมัคร ดีกว่าแบบ tile · ผู้สมัคร (คุณเมย์) เลือก Table เทียบ 9 คนพร้อมเงินเดือนคาดหวัง · ทีม (คุณอนุชา) แย่กว่าเดิม: เรียงเป็นคอลัมน์เดียวยาว และซ้ำชื่อ/ตำแหน่งใต้ Avatar · meta ยังเป็น summary ของ tool ("10 หลักสูตร") แม้ Gemini แสดงแค่ 3 · Gemini เรียบเรียงข้อความเองบ้าง ("สมัคร" → "สมัครใหม่")

- [x] หลักการจัดวางกลาง (user 2026-09-24: "หลักการต้องใช้กับเรื่องอื่นๆได้ด้วย") ใน `COP_RULES` ใช้กับทุก UI ที่โมเดลประกอบเองโดยไม่ใช้ DataCard/AlertsCard ไม่ผูกกับเรื่อง: หนึ่ง Card · title = คำตอบ · meta บอกขอบเขตของสิ่งที่แสดงจริง (ถ้าคัดมาบางแถวให้บอก) · ลำดับ Callout → Metric ≤ 4 → รายการ → รายละเอียด · ข้อมูลหนึ่งอย่างอยู่ที่เดียว ห้ามซ้ำกับที่ component แสดงแล้ว · เทียบหลายช่อง = Table, 2–6 ชิ้น = Grid 2–3 คอลัมน์, เกิน 6 = Carousel, ห้ามคอลัมน์เดียวยาว · รายการละ ≤ 3 บรรทัด + Badge + ≤ 1 ปุ่ม · ข้อมูลที่เหมือนกันทุกแถวขึ้น meta · ปุ่ม primary เฉพาะการกระทำสำคัญสุด · คัดลอกข้อความจาก tool ไม่เรียบเรียงใหม่ · กฎเฉพาะเรื่องคน/สถานที่/หลักสูตร/ลา เหลือแค่ tool, component ของแต่ละชนิดข้อมูล และปุ่ม
- ดูด้วยตาหลังปรับ (Gemini จริง): ทีม (คุณอนุชา) Callout ใบอนุญาต/โอที → Metric 2 → Carousel 7 คน ไม่ซ้ำชื่อ → Table ตำแหน่งว่าง · โรงงาน (คุณธนา) Callout → Metric 3 → Grid 3×2 ปุ่ม primary เฉพาะขอนแก่น

- [x] (user 2026-09-24: "ต้องมีหลักว่า Data แบบไหนไม่ควรใช้ Carousel" · "ระบบเราไม่มีการกดดูรายละเอียด ถ้ากดก็ต้องเป็นกดส่งเข้า chat ให้ AI ไปหารายละเอียดมาเอง") · ตรวจการ์ดทีม: Carousel ผิด (เห็น 2 จาก 7 คน, ใบอนุญาตคุณกฤตกับทดลองงานคุณจอยต้องปัดถึงเห็น)
  - หลัก Carousel: ใช้ได้เมื่อครบทุกข้อ = เป็นตัวเลือกที่ผู้ใช้จะเลือก 1–2 อย่าง, เด่นที่รูป, ไม่ต้องเทียบทีละช่อง, พลาดชิ้นท้ายได้ · ห้ามกับสมาชิกทีม ผู้สมัครที่ต้องเทียบ สถานที่ที่ต้องดูความเสี่ยง รายการเรียงลำดับ หรือชุดที่บางชิ้นมีเรื่องเตือน → Grid ให้เห็นครบ หรือ Table
  - ปุ่มมีสองแบบ: ถามต่อ = host tool `ask { prompt }` (`lib/cards/host-tools.ts`, `components/cards/action-tool.ts`) ส่งคำถามภาษาไทยเข้าแชทเหมือนผู้ใช้พิมพ์ แล้วโมเดลเลือก tool เอง · ลงมือทำ = `runTool` ของ tool เขียน (approval) · ห้าม `runTool` tool อ่านตรง
  - บั๊กที่พบ: ปุ่ม Vexa `runTool` ใน Cop กดแล้วเงียบมาตลอด เพราะ `session-chat.tsx` ลงทะเบียน sender กับ Cop อย่างเดียว ไม่ได้ `host.registerChatSender` → แก้แล้ว · ก่อนแก้ ปุ่มที่โมเดลวาดทุกปุ่ม (ดูโปรไฟล์/ดูรายละเอียด/สมัคร) ไม่ทำงาน แต่ eval ผ่านเพราะตรวจแค่ spec
  - eval: ส่ง host tools แบบเดียวกับเบราว์เซอร์ (`hostToolDescriptors`) · check ใหม่ `pressAsks` (ปุ่มไม่เรียก tool อ่านตรง) และ `noCarousel` (ทีม สถานที่ ผู้สมัคร) · mock ผู้สมัครเป็น Grid
  - ดูด้วยตา: ทีม (คุณอนุชา) Grid 2 คอลัมน์ 7 คนเห็นครบ · กด "ดูโปรไฟล์" คุณป้อง → แชทขึ้น "ขอดูโปรไฟล์คุณป้อง แสนสุข" → Gemini เรียก get_person เองและประกอบโปรไฟล์ · พบ: Gemini เติม "ณ 24 ก.ย. 2569" ใน footnote เอง

- [x] (user 2026-09-24: "ดูยากแปลกๆ" → วิจารณ์แล้วทำตามแนะนำ) การ์ดทีมพูดเรื่องเดียวซ้ำ 4 ที่ (ข้อความตอบ, Callout, Metric นับแถว, ป้าย) · ปุ่ม "ดูโปรไฟล์" 7 ปุ่มดังกว่าคน · แต่ละคนไม่มีขอบเขต แถวเหลื่อม · ป้ายยาว · ผู้ถามอยู่ในรายชื่อทีมตัวเอง
  - Vexa `ListItem` (general, 5 ที่ตาม Vexa CLAUDE.md): รูปแบบ avatar/thumb, title, subtitle, detail, badges, trailing · มี `on.press` = ทั้งแถวกดได้พร้อมลูกศร แทน Avatar + Text + Badge + Button ต่อแถว (§9)
  - หลัก "หนึ่งเรื่อง หนึ่งที่": ข้อความตอบ = สิ่งที่ต้องทำก่อน · ป้าย = ใครเข้าเงื่อนไข · Callout เฉพาะเรื่องที่ไม่มีที่อื่นแสดง · Metric เฉพาะตัวเลขชี้ขาดที่ tool ส่ง ห้ามนับแถวที่แสดงอยู่ · ห้ามปุ่มซ้ำทุกแถว ใช้กดทั้งแถว
  - ป้ายสั้น: "ใบอนุญาตขายสุรา 16 วัน", "โอที 118 ชม." (`TH.people.certShort`) — ย่อเหลือ "ใบอนุญาต" แล้ว Gemini เข้าใจผิดเป็น "ใบอนุญาตขับขี่" จึงคงคำว่าขายสุรา · แถวของผู้ถามมี `is_you` และไม่แสดงเป็นสมาชิก
  - ดูด้วยตา (Gemini): ทีม = ListItem 6 แถวใน Grid 2 คอลัมน์ ไม่มี Callout/Metric ซ้ำ · โรงงาน = ListItem 6 แถวเรียงที่ต้องดูก่อน ตัวเลขวันชิดขวา · ยังเหลือ: แถวตำแหน่งว่างมีคำเติม "ตำแหน่งเปิดรับ" ซ้ำหัวข้อ, Gemini เขียน "ไร้อุบัติเหตุ N วัน" เองแทน label ของ tool และเติม "ณ 24 ก.ย. 2569" ใน footnote · eval `people-team`, `sites-overview` 1 รอบผ่าน

**6G ปิดงานค้าง** (2026-09-24, /go phase 6)
- [x] ใบลาและคำขออบรม (packet ที่มีใน `staff-requests`) หัวหน้ากดรับ/ตีกลับได้แม้สวิตช์ `handoff` ปิด (`isStaffRequestPacket` ใน `lib/server/staff-requests.ts`, `app/api/inbox/[id]/route.ts`) — สวิตช์ยังคุม handoff ของ agent เหมือนเดิม
- [x] Vexa `ListItem.trailingTone` good/bad/neutral (§9) · ชื่อยาวไม่ถูกตัดเพราะ trailing: แถวหัวข้อ wrap ให้ trailing ลงบรรทัดใหม่เมื่อไม่พอ
- [x] `get_site` ส่ง `trailing { text: "ไร้เหตุหยุดงาน N วัน", tone }` แทน `stat` ตัวเลขเปล่า ให้ Gemini คัดลอกได้ตรง ไม่ต้องแต่งคำเอง
- [x] prompt: footnote = ชื่อแหล่งข้อมูลอย่างเดียว · ตำแหน่งว่าง = `ListItem { title, subtitle: open_label }` ไม่มีคำเติม · normalizer ตัด "ณ <วันที่>" ที่โมเดลเติมใน footnote ของการ์ดที่ประกอบเอง (เทสต์ 2)
- [x] `hr.test.ts` ไม่พึ่งคำขอที่มีอยู่ใน `.data`: นับ "รออนุมัติ" ก่อน/หลัง และลบเฉพาะคำขอที่เทสต์สร้าง (เดิมเก็บคำขอทั้งหมดของคุณกฤตไปลบ)
- ดูด้วยตา (Gemini): คุณกฤตยื่นใบลา 5–6 ต.ค. → คุณอนุชากด "รับงาน" ใน Inbox ได้ สถานะ "รับแล้ว" ขณะสวิตช์ปิด · ทีม (คุณอนุชา light 1280) ตำแหน่งว่างไม่มีคำซ้ำ footnote ไม่มีวันที่ · โรงงาน (คุณธนา dark 390) ตัวเลขวันแดง 7 วัน/เขียวที่เหลือ ชื่อแสดงเต็ม ไม่มี scroll แนวนอน · ไม่ได้รัน eval (ผู้ใช้สั่ง)

**6H งานที่พบตอนตรวจ 6G** (user 2026-09-24: "ทำเลย")
- [x] พิมพ์ขอลาพร้อมวัน → Gemini เรียก `request_leave` ทันที (คำอธิบาย `get_policy`/`request_leave` + prompt) · `LeaveForm` รับ `kind`/`from`/`to`/`reason` ที่ผู้ใช้พิมพ์มา · ค่าที่กรอกและสถานะ "ส่งแล้ว" อยู่รอดเมื่อฟอร์ม remount (ก่อนหน้านี้หลังกดยื่น ฟอร์มกลับไปเป็นค่าเริ่ม)
- [x] กำหนดส่งใน Inbox: `dueTimeTh` ("อีก 3 วัน" / "เลยกำหนด 2 ชั่วโมง") แทน `relativeTimeTh` ที่อ่านเวลาในอนาคตเป็น "เมื่อสักครู่" — เกิดกับ handoff ทุกใบ ไม่ใช่แค่ใบลา (เทสต์ 2)
- [x] ลิงก์ `?prompt=` (ชิปหน้าแรก, ปุ่ม Inbox) ส่งด้วย mock: dev StrictMode ยกเลิก fetch รายชื่อโมเดลครั้งแรก แต่ `.finally` ยังตั้ง `modelReady` → คำถามแรกออกไปก่อนได้ค่า default · แก้ให้ตั้งเฉพาะเมื่อไม่ถูกยกเลิก และลบ `?prompt` ด้วย `history.replaceState` แทน `router.replace` (ไม่โหลด RSC ซ้ำระหว่าง stream)
- [x] dark mode ตามเครื่องจนกว่าผู้ใช้จะเลือกเอง (boot script + `ThemeProvider` ฟัง `matchMedia`)
- ดูด้วยตา (Gemini): คุณกฤตพิมพ์ "ขอลาพักร้อนวันที่ 12 ถึง 13 ตุลาคม 2569 ไปงานแต่งเพื่อน" → การ์ดอนุมัติทันที ไม่มีฟอร์ม · ฟอร์มจาก "ลาพักร้อนยังไง" หลังกดยื่นยังเป็น 19–20 ต.ค. + เหตุผล + ปุ่ม "ส่งให้ Cop แล้ว" (ทั้งสองคำขอกด "ยังไม่ส่ง" ไม่มีข้อมูลเพิ่ม) · Inbox คุณอนุชา "กำหนดส่ง อีก 3 วัน" · `?prompt=ใครโอทีหนัก` ส่งด้วย Gemini · emulate dark โดยไม่มีค่าเก็บ → หน้าเป็น dark ทันทีและหลัง reload

ลำดับ: 6A (คน + รูป) → 6B (`find_people`, `get_person`) → 6C เฉพาะ "ทีมขายภาคอีสาน" ให้ผู้ใช้ดูด้วยตา → ค่อยขยายไปอีก 5 แบบ
ตรวจ: typecheck, test, `eval:cards --case=entity-*` กับ Gemini, ดูด้วยตาในเบราว์เซอร์ (light/dark, 390px) ในฐานะคุณเมย์ คุณอนุชา และคุณกฤต (บทบาทที่เห็นน้อยที่สุด)
- ตรวจแล้ว (2026-09-23): typecheck, 462 tests, ดูด้วยตาในฐานะคุณอนุชา: การ์ดทีม (light กว้าง, dark 500px ไม่มี scroll แนวนอน) และโปรไฟล์คุณป้องที่ Gemini ประกอบเองจากการกดการ์ด · ยังไม่ได้ดูด้วยตาในฐานะคุณเมย์/คุณกฤต
- พบ: คำสั่งตรวจ `curl /login | grep -c "เข้าสู่ระบบ"` ใน CLAUDE.md ได้ 0 ตั้งแต่ login แบบเลือกบทบาทก่อน (หน้ายังตอบ 200)

### Phase 7 — ต่อระบบอื่นผ่าน connector โดยสิทธิ์ยังคุมที่ Cop ที่เดียว (user decision 2026-09-24: "เขียน work package ลง plan เลย ทุก connector ต่อกำหนดสิทธิ์ได้เหมือนเดิม")

ที่มา: tool ส่วนใหญ่ของ Cop เป็นระบบภายนอกที่ตอนนี้ mock ไว้ — `query_metric`/`list_metrics`/`describe_entity` = data warehouse, `find_people`/`get_person`/`list_candidates` = HRIS/ATS, `list_courses`/`enroll_course` = LMS, `get_policy`/`request_leave` = ระบบลา, `get_site`/`get_calendar` = ข้อมูลไซต์/ปฏิทิน, `send_email` = mail · ส่วน handoff, dashboard, watch, memory, admin เป็นของ Cop เอง · ปัญหาวันนี้: (1) มีแค่ metric ที่มี port (`DataPort`) ที่เหลือ import `lib/data/entities/*` ตรงจาก logic (`lib/server/people.ts`, `sites.ts`, `courses.ts`, `leave.ts`, `recruiting.ts`, `lib/access/people-scope.ts` และแม้แต่ client `components/cards/approval-card.tsx`) (2) `DataPort` เป็น sync แต่ระบบจริงเป็น async (3) เพิ่ม tool หนึ่งตัวต้องแก้ union `ToolName`, schema, `TOOL_SURFACE`, map ใน `tools.ts` (505 บรรทัด 22 tool) (4) ถ้าส่ง `mcp` เข้า `createVexaHandler` ตรงๆ tool นั้นไม่ผ่าน `toolsFor` → ทุกบทบาทเห็น ไม่มี kill switch ไม่มี audit ของ Cop ไม่มี scope/mask และ header ตายตัวต่อบทบาท ส่งตัวตนผู้ใช้ไปปลายทางไม่ได้

หลัก: **MCP (หรือ SQL/REST) เป็น adapter ที่อยู่หลัง tool ของ Cop ไม่ใช่เส้นทางแยก** · ทุก tool ไม่ว่ามาจากไหนอยู่ใน surface เดียว มี `connector`, `tier`, `roles` ที่ Cop ประกาศเอง (ไม่เชื่อ metadata ของ server) แล้วผ่าน `toolsFor` → role policy → admin override → kill switch → สวิตช์ connector → `withAudit` เหมือน tool ในบ้านทุกประการ · หน้า admin, `set_permission`, audit, simulate อ่านจาก surface นี้ จึงกำหนดสิทธิ์ tool ของ connector ใหม่ได้ทันทีโดยไม่แก้ UI · ขอบเขตข้อมูล (ภาค/แบรนด์/สายบังคับบัญชา) และการปิดค่า (masked) ทำใน Cop ก่อนผลถึงโมเดล · โมเดลเห็นชื่อ tool และรูปผลลัพธ์เดิม prompt/eval/การ์ดไม่ต้องแก้

**7A tool contract เดียว: หนึ่ง tool หนึ่งไฟล์** (`lib/server/tools/**` ใหม่, `lib/server/agent/tools.ts`, `lib/contracts/tools.ts`, `lib/access/*`, `lib/server/permissions.ts`, `app/(app)/admin/actions.ts`, `components/admin/*`, `lib/eval/check-cards.ts`) — ทำแล้ว 2026-09-24
- [x] `defineTool({ name, connector, tier, roles, description, input, execute })` ใน `lib/server/tools/define.ts` ห่อ `withAudit` ให้เอง และตั้ง `needsApproval` จาก tier (ทุกตัวที่ไม่ใช่ read) · tool ละไฟล์ `lib/server/tools/<kebab-name>.ts` export `<camelName>Tool` · helper ที่ใช้ร่วม (`now`, `recipient`, `ALL_BUT_SALES_REP`) อยู่ใน `shared.ts` · `registry.ts` มี `toolSurface()`, `surfaceEntry`, `isToolName`, `copTool`, `defaultToolsOf(role)`, `toolLabel` · `agent/tools.ts` เหลือ `toolsForAccess`, `copTools()`, `toolTiers()`
- [x] contracts เก็บแค่ชนิด `ToolSurfaceEntry { name, connector, tier, roles, labelTh, bodyTh }` + `toolRolesInclude` · `ToolName = NativeToolName | \`${string}__${string}\`` (native ยังเป็น union ตรวจตอน compile ผ่าน `{ [Name in NativeToolName]: CopTool<Name> }` ใน registry) · `NATIVE_CONNECTORS` · `TOOL_SURFACE`/`toolsAllowedFor` ถูกลบ · admin tabs เป็น server component จึงเรียก `toolSurface()`/`toolLabel()` ตรง ไม่ต้องส่ง props
- [x] ผู้อ่าน surface เปลี่ยนเป็น registry ทั้งหมด: `enforce.ts`, `role-overrides.ts`, `policies.ts` (`RolePolicy` ไม่มี `toolAllow` แล้ว — ค่าเริ่มคำนวณตอนเรียกผ่าน `defaultToolsOf` เพื่อไม่ให้ import วนของ access ↔ tools อ่านค่าตอนโหลด module), `permissions.ts`, admin `actions.ts`, `access-tab`, `tools-tab`, `audit-tab`, `overview-tab`, `simulate-tab`, `check-cards.ts`
- [x] พฤติกรรมไม่เปลี่ยน: ชื่อ, description, schema, tier, roles ของ 22 tool เหมือนเดิม (description คัดลอกตรงด้วยสคริปต์) · ข้อความสรุปของ `set_permission` ยังใช้ชื่อ tool ดิบเหมือนเดิม
- [x] `lib/access/surface.test.ts`: ตารางชื่อ/connector/tier/roles ของ native ตรงกับของเดิม · ทุก entry มี label, body, execute · approval ตรงกับ tier · ทุก tool × ทุกบทบาท: ค่าเริ่มตาม `roles`, ปิดได้, เปิดได้เฉพาะที่ tier ยอม, kill แล้วหายทุกบทบาท, เรียกแล้วมีแถว audit แม้ล้ม (probe ที่ throw ตอนอ่าน input ก่อนมีผลข้างเคียง; เทสต์คืนค่า override/kill/audit ที่ตัวเองสร้าง)
- เพิ่ม native tool (compiler บังคับครบทั้ง 4 จุด): (1) `lib/server/tools/<kebab-name>.ts` ด้วย `defineTool` (2) ชื่อใน `NativeToolName` (`lib/contracts/tools.ts`) (3) หนึ่งบรรทัดใน map ของ `registry.ts` (ลำดับใน map = ลำดับในหน้า admin) (4) `TH.admin.tools.<name>` label + body · แล้วหน้า admin, override, kill switch, audit, `set_permission` และ `surface.test.ts` รับเอง (ต้องเพิ่มแถวในตาราง `NATIVE_SURFACE_BEFORE_CONNECTORS` ของเทสต์ด้วย เพราะเทสต์นั้นล็อกของเดิมไว้)
- ตรวจแล้ว: typecheck, 495 tests (488 + 7) · curl `/admin` ทุกแท็บ 200 พร้อม label ไทย · แชท mock ในฐานะคุณอนุชา: `query_metric` ผ่าน registry คืนเฉพาะภาคอีสาน (ทิ้งแถว audit หนึ่งแถวใน `.data` ไม่มี thread)

**7B port ต่อโดเมน และ async** (`lib/server/ports/**` ใหม่, `lib/server/{people,sites,courses,leave,recruiting,staff-requests,watches,briefing,dashboard,handoff,alerts}.ts`, `lib/access/people-scope.ts`, `lib/access/suppression.ts`, `components/cards/approval-card.tsx`, `components/admin/simulate-tab.tsx`) — ทำแล้ว 2026-09-24
- [x] 7B-1 metrics (2026-09-24): `DataPort` → `MetricsPort` ใน `lib/server/ports/metrics.ts` (async: `runMetric`, `listMetrics`, `describeEntity`; `metricsPort()`/`registerMetricsPort`/`resetMetricsPort`) · adapter `generatorMetricsPort` ใน `lib/data/register.ts` · ทุกที่ที่เคย import `runMetric` จาก `lib/data/query` ตรง (watches, briefing, handoff, dashboard, simulate) อ่านผ่าน port แล้ว · async ลามถึง: `createWatch`, `runWatchJob`, `tick` (scheduler รอ runner และจับ error ของ promise), `morningBriefFor`, `changesSince`, `resolveEvidence`, `resolveWidget`, `widgetViews`, `landingKpis`, `visitsFor`, `impactOf` (`DailyBeer` คืน Promise), `SimulateTab`, หน้าแรก, dashboard, inbox API, jobs API · ลบ `stub-data-port.ts` (389 บรรทัด ไม่มีใครใช้ตั้งแต่ 1A) · ยังอ่าน `lib/data/query` ตรง: engine ฝั่ง batch (`forecast`, `series`, `hypothesis`) ซึ่งตามจริงรันใกล้ warehouse และ `scripts/inspect-data.ts` — ย้ายเมื่อมี warehouse จริง ไม่ใช่งาน 7B · ตรวจ: typecheck, 495 tests, curl `/`, `/dashboard` (3 บทบาท), `/api/inbox`, `/admin?tab=simulate` = 200
- [x] 7B-2 port ต่อโดเมน (2026-09-24): `lib/server/ports/` มี `directory` (คน + ตำแหน่งว่าง; `directoryOf` ให้ `byId`/`managersOf`/`reportsTo`), `recruiting`, `learning`, `leave` (`policy()` + `usedThisYear`), `sites` (sites + incidents), `calendar` (วันหยุด, วันห้ามขาย, เทศกาล; `calendarOf` ให้ `events`/`holidayOn`/`isAlcoholBanDay`), `mail` (`send` คืน `OutboxEntry`) · ทุก port อยู่ใน `ports()` เดียว (`registerPorts(partial)`/`resetPorts`) · adapter เดโมทั้งหมดอยู่ใน `lib/server/ports/generator.ts` (mail = outbox ในแอป) · ชนิด record ย้ายไป `lib/contracts/records.ts` (`Employee`, `Candidate`, `Course`, `Site`, `Incident`, `CalendarEvent`, `LeavePolicy`, `MailMessage` …) entity ของ generator re-export
- [x] แนวทาง: ฟังก์ชันขาเข้า (`findPeople`, `personProfile`, `siteDetail`, `listCandidates`, `listCourses`, `enrollCourse`, `policyFor`, `requestLeave`, `approverOf`, `submitRequest`, `createPacket`, `runDigestJob`, `ensureDemoStory`) เป็น async โหลด record ผ่าน port ครั้งเดียวต่อการเรียก แล้วตรรกะเดิมทำงานแบบ sync บน record ที่โหลดแล้ว (ส่ง `Directory`/`LeaveBook`/`Calendar` เป็นพารามิเตอร์) — ไม่ใช้ snapshot ใน request-context: ชัดกว่า และ adapter จริงควร cache เอง
- [x] scope: `peopleViewOf(access, employee, directory)`, `canSeeCandidates(access, managerId, directory)` · engine บริสุทธิ์: `safetyOf(site, incidents)`, `impactOf(event, beer, calendar)`, `people-signals` อ่านชนิดจาก contracts
- [x] mail ทุกทาง (handoff, `send_email`, watch, digest) ผ่าน `ports().mail.send` และรอผล
- [x] `approval-card.tsx` เลิก import `courseById`: `CourseApproval` ดึง `GET /api/courses/[id]` (`findCourse` ผ่าน learning port) · ลบ helper ของ entity ที่ไม่มีใครใช้แล้ว (`calendarEvents`, `holidayOn`, `isAlcoholBanDay`, `employeeById`, `managersOf`, `reportsTo`, `courseById`, `incidentsOf`, `candidatesOf`, `annualEntitlement`)
- [x] `lib/server/ports/ports.test.ts`: ไฟล์ใน `app`/`components`/`lib`/`scripts` import entity ของ people/recruiting/courses/sites/calendar/policies ไม่ได้ ยกเว้น `lib/data/**`, `ports/generator.ts`, `mock-*.ts` (สคริปต์ของ mock model), `lib/engine/series.ts` (ฝั่ง batch ของ warehouse ใช้ flag วันพระ) และเทสต์ · ลองใส่ import ผิดแล้วเทสต์จับได้
- ยังไม่ทำ: `users` (บัญชีผู้ใช้ของ Cop = ตัวตน/SSO ซึ่งอยู่ §10) และ master data ของ warehouse (`org`, `supply`, `hr` departments, `geo`) ยังอ่านตรง — เป็นของ `MetricsPort` ฝั่ง dictionary · การลงทะเบียนเรียนจริงใน LMS และการลงวันลาในระบบ HR จริงยังเป็นคำขอใน Inbox ของ Cop (เขียนกลับระบบต้นทางอยู่ §10)
- ตรวจแล้ว: typecheck, 496 tests · แชท mock: `find_people`, `get_person`, `get_site` (รายการ + รายละเอียด), `list_candidates`, `list_courses`, `get_policy`, `get_calendar` ok ผ่าน port · `GET /api/courses/crs_sales_licence` · `/outbox` 200 · ดูด้วยตา (Gemini, คุณกฤต): การ์ดอนุมัติ "ขอเข้าอบรม" แสดงชื่อหลักสูตรและ "3 ต.ค. 2569 · 1 วัน" จาก API ไม่ได้กดส่ง (thread ทดสอบ `7c3ac9dd` ใน `.data`)

**7C connector registry: ประกาศสิทธิ์ครั้งเดียว ใช้ที่เดียวกับ tool ในบ้าน** (`lib/server/connectors/**` ใหม่, `lib/server/tools/registry.ts`, `lib/access/enforce.ts`, `lib/server/audit.ts`, `lib/contracts/audit.ts`)
- [x] `ConnectorDef { id, labelTh, sourceSystemTh, kind: "native" | "mcp" }` · native = port ของ 7B (`warehouse`, `hris`, `lms`, `leave`, `sites`, `calendar`, `mail`) + `cop` (handoff, dashboard, watch, memory, admin) · tool เดิมทุกตัวได้ `connector` ของมัน
- [x] MCP connector ประกาศใน `lib/server/connectors/<id>.ts` (server-only, secret อ่านจาก env): `{ id, labelTh, transport, auth: (access) => headers, timeoutMs, tools: { [remoteName]: { as?, labelTh, tier, roles, input?, scope, sensitive?, output? } } }` → ชื่อบน surface `${id}__${as ?? remoteName}` · เปิดเฉพาะ tool ที่ระบุ (ไม่มี `*`) · `tier`/`roles` มาจาก config นี้เท่านั้น · ไม่ระบุ tier = `destructive` + `needsApproval`
- [x] `scope` บังคับทุก tool ไม่มีค่า default (ไม่ระบุ = throw ตอนสร้าง registry แบบ allow list ของ Vexa): `{ kind: "none", reason }` สำหรับข้อมูลที่ไม่ผูกคน/ภาค (เช่น นโยบายบริษัท) · `{ kind: "inject", args: (access) => partial }` Cop เขียนทับ argument ที่ระบุขอบเขตก่อนส่ง (แบบเดียวกับที่ฉีด scope เข้า semantic query) โมเดลขยายขอบเขตเองไม่ได้ · `{ kind: "filter", rows: (rows, access) => rows }` กรองหลังได้ผล · ใช้ inject + filter คู่กันได้
- [x] `sensitive: [{ field, key }]` → ค่าปิดตามสิทธิ์ (`full` / `masked` / `none`) ต่อบทบาท แบบเดียวกับ metric: `role-overrides` เพิ่ม `kind: "field"` (key = `${connector}.${field}`) · `masked` แทนค่าด้วย `***` และนับใน `provenance.masked` ให้ audit บันทึก `decision: "masked"` เหมือน metric
- [x] `output`: adapter แปลงผลดิบเป็นรูปของ Cop `{ ok, summary, rows ≤ 60 พร้อม *_label, provenance { sourceSystem, asOf } }` · ไม่มี adapter = ย่อแบบทั่วไป (60 แถวแรก, แบน object, fence ด้วย `fenceAsData`) · description ของ server ถูก fence เสมอ
- [x] เชื่อม MCP เอง ไม่ใช้ option `mcp` ของ `createVexaHandler` (header ตายตัว, handler memo ต่อบทบาท): `execute` ขอ client จาก pool ต่อผู้ใช้ (`auth(access)` → header ของคนที่ถาม, หมดอายุ 10 นาที) · handler ยัง memo ต่อบทบาทได้เพราะชุด tool ขึ้นกับบทบาท ตัวตนมาจาก `request-context`
- [x] สวิตช์ connector: admin ปิดทั้ง connector ได้ (generalize สวิตช์ `handoff` เป็น `switches` id `connector:<id>`) · `closedTools()` รวม tool ทั้งหมดของ connector ที่ปิด → ปุ่ม next-action และ tool หายพร้อมกัน
- [x] ล้มเหลว: timeout/เชื่อมไม่ได้ → `{ ok: false, code: "CONNECTOR_UNAVAILABLE", error: "<labelTh> ไม่ตอบในขณะนี้" }` และมีแถว audit · ตอนเริ่ม server เทียบรายชื่อ tool ที่ server ประกาศกับ config แล้ว log ตัวที่หายหรือ schema ไม่ตรง (ไม่เปิด tool ที่ config ไม่มี)
- [x] `AuditEntry` เพิ่ม `connector`
- ทำแล้ว 2026-09-24: `lib/server/connectors/` = `types.ts` (config, scope, sensitive, output), `define.ts` (`defineMcpConnector` ตรวจ id/ชื่อ/roles/scope แล้วสร้าง `CopTool` ที่ห่อ `withAudit`), `call.ts` (inject → เรียกในนามผู้ถาม → adapter หรือ `genericOutput` → filter → mask → 60 แถว → `fence`; description/schema อ่านจาก catalog ของ server ผ่าน getter เว้นแต่ config เขียนเอง), `pool.ts` (client ต่อ `connector:userId` อายุ 10 นาที, `registerClientFactory` สำหรับเทสต์), `catalog.ts`, `reconcile.ts` (เรียกใน `instrumentation.ts`: log tool ที่หาย/ไม่ได้เปิด/schema ไม่ตรง), `native.ts` (ป้ายไทยของ connector ในบ้านใน `TH.admin.connectors`), `index.ts` (`CONFIGURED` ว่าง รอ 7E; `registerConnectors`/`resetConnectors`), `stub.ts` (connector ทดสอบ + server ในหน่วยความจำ ใช้ต่อใน red-team 7E)
- registry: `connectors()`, `toolsOfConnector`, `connectorFields`, `fieldLabel` · `role-overrides`: `FieldOverride`, `fieldVisibilityOf`, `setFieldVisibility`, `cycleFieldVisibility` (ไม่ใส่ใน `AccessContext` — อ่านตอนเรียก tool) · `enforce`: `switchEntry`/`setSwitch`, `connectorEnabled`/`setConnectorEnabled` (id `connector:<id>`, ใช้กับ connector ในบ้านได้ด้วย) · `withAudit(tool, connector, execute)`
- ผลที่ server ตอบ `isError` → `CONNECTOR_FAILED` (ข้อความของ server ถูก fence) แยกจาก `CONNECTOR_UNAVAILABLE`
- ตรวจแล้ว: typecheck, 512 tests (`connectors.test.ts` 14 + `surface.test.ts` วน stub connector ด้วย: สวิตช์ connector ต่อ entry, audit มี connector) · curl `/admin` ทุกแท็บ 200

**7D admin: connector ในหน้าสิทธิ์เดิม** (`components/admin/*`, `app/(app)/admin/**`, `lib/server/permissions.ts`, `lib/i18n/th.ts`)
- [x] ตารางสิทธิ์ tool × บทบาท จัดกลุ่มตาม connector (หัวกลุ่ม: ชื่อ, แหล่งข้อมูล, สถานะเชื่อมต่อ, สวิตช์ทั้ง connector) · กดเซลล์เปิด/ปิดแบบเดิม
- [x] ค่าที่ปิดตามสิทธิ์ของ connector (`sensitive`) อยู่ใต้ส่วนเมตริกเดิม วนค่า full → masked → none แบบเดิม
- [x] แท็บ tools: คอลัมน์ connector, tier, kill · แท็บ audit: กรองตาม connector · แท็บ simulate: แสดง tool ของ connector ที่บทบาทนั้นเรียกได้
- [x] `set_permission` รับชื่อ tool ของ connector และ `kind: "field"` (description เพิ่มหนึ่งประโยค — แตะ description จึงรัน `eval:cards --case=admin-*` เฉพาะเคส admin)
- ทำแล้ว 2026-09-24: `components/admin/connector-parts.tsx` (`ConnectorHeader`: ชื่อ, แหล่งข้อมูล, สถานะ ในบ้าน/เชื่อมต่ออยู่/เชื่อมไม่ได้/ยังไม่ได้ลองเชื่อม, สวิตช์ทั้ง connector) ใช้ในแท็บสิทธิ์ (ทีละบทบาท + ตารางเทียบ) และแท็บเครื่องมือ · registry `surfaceByConnector()`, `connectorLabel` · สถานะ connector เก็บใน collection `connector-health` (Next แยก module ระหว่าง route แชทกับหน้า admin ค่าในหน่วยความจำจึงไม่ข้ามกัน) · audit กรอง `connector` (แถวเก่าที่ไม่มี connector ใช้ connector ของ tool ปัจจุบัน) · simulate จัดกลุ่มตาม connector · action `setConnectorAction`, `setFieldAction`, `cycleFieldAction`
- แก้บั๊กเดิม: `handlerFor` memo ต่อบทบาทอย่างเดียว → override/kill/สวิตช์ไม่มีผลกับแชทจนรีสตาร์ท ตอนนี้ key = บทบาท + ชุด tool ที่ใช้ได้จริง (เทสต์ใน `handler.test.ts`)
- eval: ไม่มีเคส `admin-*` ให้รัน (ดู สถานะ)

**7E connector ตัวอย่างหนึ่งตัว + red-team** (`scripts/mcp-demo-lms.ts` ใหม่, `lib/server/connectors/lms-demo.ts` ใหม่, `lib/access/redteam*.test.ts`)
- [x] MCP server เดโม (http บน localhost, `bun run mcp:demo`) ให้ประวัติการอบรมรายคนจากข้อมูล generator — พิสูจน์ทั้งเส้น: config → surface → ตารางสิทธิ์ใน admin → header ของผู้ถาม → scope inject + filter → field masked → audit → การ์ดในแชท
- [x] red-team (ต่อชุด 3A, ทำงานกับ stub adapter ไม่ต้องเปิด server): sales_rep ขอข้อมูลภาคอื่นผ่าน tool ของ connector → 0 รั่ว · โมเดลส่ง argument ขยายขอบเขต → ถูกเขียนทับ · tool ที่ server มีแต่ config ไม่มี → เรียกไม่ได้ · ปิด connector → tool และปุ่มหาย · description ของ server มีคำสั่งแทรก → ถูก fence · บทบาทที่ admin ปิด tool → `TOOL_NOT_ALLOWED` + audit `deny`
- [x] ดูด้วยตา: คุณกฤต (sales_rep) ถามประวัติอบรมของตัวเอง → การ์ด; ถามของคนอื่นนอกสาย → ตอบว่านอกขอบเขต · admin ปิด tool นี้ให้ sales_rep ในตาราง → คำถามถัดไปของคุณกฤตไม่มี tool นี้
- ทำแล้ว 2026-09-24: `scripts/mcp-demo-lms.ts` (`bun run mcp:demo`, :3199) เขียน JSON-RPC ของ MCP เอง ไม่เพิ่ม dependency · ตรวจลายเซ็น `x-cop-*` (HMAC จาก `COP_LMS_DEMO_SECRET`, `signed-identity.ts`) ไม่ผ่าน = 401 · ประวัติจาก `history` kind trained + `certificates` ผ่าน directory port · `lms-demo.ts`: inject `regions` ของผู้ถาม, filter ด้วย `peopleViewOf` (เห็นเฉพาะ team/hr), `score` ปิดตามบทบาท (CEO/HR เห็น, ผอ.ขาย/RSM ซ่อนตัวเลข, ที่เหลือไม่เห็น) · อยู่ใน `CONFIGURED` แล้ว tool จึงอยู่บน surface ของทุกบทบาท ถ้า server ไม่เปิด = `CONNECTOR_UNAVAILABLE`
- เพิ่มจากแผน: ผลที่ server ส่งมาแต่ถูก filter ทิ้งหมด → `PERMISSION_DENIED` (audit deny) · 0 แถวบน tool ที่มี scope → summary "ไม่มีข้อมูลในขอบเขตที่คุณเห็นได้" · execute ของ connector tool ตรวจ `isToolAllowed(withAdminSwitches(access))` เองด้วย → `TOOL_NOT_ALLOWED` แม้ handler ยังถือ tool เก่า
- `lib/access/redteam-connectors.test.ts` (9 เทสต์, client ในโปรเซสที่เรียก `lmsDemoFetch` จริง): rep ทุกคน × พนักงาน 40 คน รั่ว 0 · regions ที่โมเดลส่ง "all" ถูกเขียนทับ · เพื่อนร่วมภาค = PERMISSION_DENIED · RSM เห็นคะแนน `***` HR เห็นเต็ม · ไม่มีลายเซ็น = 401 · tool ที่ server มีแต่ config ไม่มี เรียกไม่ได้ · ปิด connector = tool และ toolAllow หาย, call ค้าง = TOOL_NOT_ALLOWED · admin ปิดให้ sales_rep = TOOL_NOT_ALLOWED + audit deny · การ fence description อยู่ใน `connectors.test.ts`
- ดูด้วยตา (Gemini, context แยก ไม่แตะ session คุณกฤตใน Chrome ของผู้ใช้): คุณกฤตถามประวัติตัวเอง → การ์ด 2 แถว (ใบอนุญาตใกล้หมดอายุ, หลักสูตรที่ผ่าน) คะแนนถูกปิด · ถามคุณนก (ภาคเดียวกัน นอกสาย) → "อยู่นอกขอบเขตสิทธิ์" · admin ปิด tool ให้ sales_rep → คำถามถัดไปไม่มีการเรียก `lms_demo__training_history` ใน audit (ก่อนแก้ `handlerFor` ยังเรียกได้และถูกปฏิเสธใน execute) · คืน override แล้ว · thread ทดสอบ `490b4f2f` อยู่ใน `.data`

เกณฑ์ผ่านของ phase:
- เพิ่ม MCP connector = ไฟล์ config หนึ่งไฟล์ (+ adapter ถ้าต้องการ) ไม่แก้ contracts, `tools.ts`, admin UI, หรือ prompt
- เพิ่ม native tool = ไฟล์เดียวใน `lib/server/tools/`
- ทุก tool บน surface กำหนดสิทธิ์ต่อบทบาท, kill, ปิดทั้ง connector, masked field และ audit ได้ — พิสูจน์ด้วย `surface.test.ts` ที่วนทุก entry ไม่ใช่เทสต์ราย tool
- tool ที่ไม่มี `scope` หรือ `roles` สร้าง registry ไม่ได้
- ของเดิมไม่เปลี่ยน: เทสต์เดิมผ่านทั้งหมด ชื่อ/description tool เดิมเหมือนเดิม

ลำดับ: 7A → 7B (แตะไฟล์ชุดเดียวกัน ทำต่อกัน ไม่ขนาน) → 7C → 7D ∥ 7E
ตรวจ: typecheck, test, curl `/admin` · eval เฉพาะเคส admin หลัง 7D (ตามหลัก "eval เมื่อจำเป็นจริง") · ดูด้วยตาใน 7E
นอกขอบเขตของ phase นี้ (ยังอยู่ใน §10): ต่อ HRIS/ERP/LMS จริง, SSO/on-behalf-of token จริง (`auth(access)` ของเดโมคืน header ที่ลงชื่อด้วย secret ของ Cop), เขียนกลับ ERP

**7F warehouse ตอบแค่ข้อเท็จจริง สิทธิ์และรูปคำตอบอยู่ที่ Cop** (user decision 2026-09-24: "เขียนลง plan แล้วเริ่ม 7F เลย") (`lib/data/query.ts`, `lib/semantic/engine.ts` ใหม่, `lib/data/facts.ts` ใหม่, `lib/contracts/facts.ts` ใหม่, `lib/server/ports/metrics.ts`, `lib/server/metrics.ts` ใหม่, ผู้เรียก `ports().metrics.runMetric` ทุกที่)
หลัก: วันนี้ `MetricsPort.runMetric(query, access)` ส่ง `AccessContext` ให้ warehouse → ถ้าเสียบ warehouse จริง ต้องเขียน scope injection, ACL, masking, small-cell suppression, compare window, headline ใหม่ในทุก adapter · หลัง 7F warehouse ไม่เห็น access เลย ตอบแค่ "ผลรวมของ metric นี้ ตามมิตินี้ ในช่วงนี้ ภายใต้ตัวกรองนี้"
- [x] 7F-1 แยกสามขั้น: `planMetric(query, access)` (sync, pure: metric def, ACL, dims, ช่วงวัน, resolve ตัวกรอง, ฉีด scope, หน้าต่างเทียบ → `FactRequest[]`) → `readFacts(requests)` (ขั้นเดียวที่ไปหา warehouse) → `finishMetric(plan, facts)` (sync, pure: เรียง/ตัด limit, suppression, mask, label, headline, summary, provenance)
- [x] `FactRequest { metric, measure: "actual" | "target", dims, filters (id ที่ resolve แล้ว), range (ISO), labelShift { days, months } }` → `FactRow { dims, value, weight }` · `labelShift` = ป้ายเวลาของแถวงวดก่อนถูกเลื่อนมาเท่างวดปัจจุบันให้ key ตรงกัน (warehouse SQL ทำได้ด้วย date add) · ratio/เก็บรายเดือน เป็นข้อมูลของ semantic layer (`lib/semantic/metrics.ts`) ไม่ใช่ของ scan
- [x] `lib/data/facts.ts` = scan ของ generator (ย้ายจาก query.ts ไม่แก้ตรรกะ) · `lib/data/query.ts` เหลือ `runMetric` sync (plan → facts ของ generator → finish; ใช้ในเทสต์และ scripts), `runSeries`, `listMetrics`, `describeEntity`
- [x] `MetricsPort` = `{ readFacts, listMetrics, describeEntity }` ไม่รับ `AccessContext` · `runMetric(query, access)` ของ server อยู่ `lib/server/metrics.ts` (plan → `await ports().metrics.readFacts` → finish) ผู้เรียกเดิมทุกที่เปลี่ยนมาใช้ตัวนี้
- [x] ตรวจว่าผลเหมือนเดิมทุกตัวเลข: snapshot ก่อนแยกของคำถามชุดใหญ่ (ทุก metric × มิติ × compare × sort × บทบาท) เทียบหลังแยกแล้วต้องตรงทุกไบต์ · เทสต์ใหม่: port ปลอมที่จดทุก `FactRequest` → ไม่มี request ใดขยายขอบเขตเกิน scope ของ rep, และ adapter ที่คืนแถวเกิน scope มา ยังถูก suppression/mask เหมือนเดิม
- ทำแล้ว 2026-09-24 (7F-1): `lib/semantic/engine.ts` (`planMetric`, `finishMetric`, `evaluateMetric`, `seriesRequest`, `keyRows`) · `lib/data/facts.ts` (`readGeneratorFacts`, scan เดิมไม่แก้ตรรกะ) · `lib/contracts/facts.ts` · `RATIO_METRICS`/`MONTHLY_METRICS`/`TARGET_METRICS` ใน `lib/semantic/metrics.ts` (เดิม "อ่านทั้งเดือน" ดูจากแกนของ scan) · `MONTH_FIRST_DAY`/`WEEK_MIDDLE_DAY` ย้ายไป `dates.ts` · `query.ts` 1,198 → ~130 บรรทัด · `lib/server/metrics.ts` `runMetric` ใช้แทน `ports().metrics.runMetric` ใน watches, briefing, dashboard, handoff, get-calendar, query-metric, simulate, `scripts/site-hero-cards.ts`
- ลำดับ error เดิมคงไว้: scan ปัจจุบันพัง → error นั้นก่อน, แล้วค่อย "ไม่มีเป้าให้เทียบ" (`plan.comparison` เก็บ Failure ไว้คืนตอน finish)
- ตรวจ: snapshot 54,206 เคส (10 ผู้ใช้ × 21 metric × มิติ × 6 ช่วง × 4 compare × ตัวกรอง × sort + runSeries + describeEntity) ก่อน/หลัง **ตรงทุกไบต์** · `lib/server/metrics.test.ts` 6 เทสต์ (request ถูกบีบตาม scope ของ rep และมีแค่ 6 key ไม่มี access, คำถามที่ถูกปฏิเสธไม่ถึง warehouse, masked คงเป็น `***` แม้ warehouse ส่งตัวเลข, small cell ถูกปิดโดย Cop, error ของ warehouse ส่งต่อ, port generator = engine ในโปรเซส) · typecheck, 539 tests · curl `/`, `/dashboard` (ธนา, อนุชา, กฤต), `/admin?tab=simulate`, `/api/inbox` = 200 มีตัวเลขจริง
- [x] 7F-2 master data หลัง port: `MasterData` snapshot (ภาค, จังหวัด, เอเย่นต์, DC, โรงงาน, SKU, แบรนด์, แคมเปญ, แผนก, maker, ช่องทาง) จาก `ports().metrics.masterData()` · dictionary, `regionOfDimValue`/`brandOfDimValue`, `cohortSize` (suppression), `geo` สร้างจาก snapshot ที่ส่งเข้าไป ไม่ import `lib/data/entities` ตรง · ผู้ใช้ฝั่ง client (`approval-card` เรียก `displayLabel`) รับป้ายจาก server แทน · engine ฝั่ง batch (`forecast`, `series`, `hypothesis`) ยังอ่าน generator ตรงตามเดิม
- ทำแล้ว 2026-09-25 (7F-2): `MasterData` ใน `lib/contracts/master.ts` (เฉพาะฟิลด์ที่ Cop อ่าน: ภาค, หน่วยธุรกิจ, จังหวัด, เอเย่นต์ + ภาค/DC, แบรนด์, pack, SKU, DC, โรงงาน, แคมเปญ, แผนก + headcount, ช่องทาง, chain, maker, `ownMaker`) · `MetricsPort.masterData()` · `createDictionary(master)` แทน dictionary ระดับ module (คำพ้อง/ชื่อเล่นยังเป็นของ Cop) และเพิ่ม `regionOf`/`brandOf` ที่ engine ใช้ตรวจ scope · `lib/server/master-data.ts` `loadDictionary()` โหลดผ่าน port เก็บ 10 นาทีต่อ port (load พังไม่ถูกเก็บ) · `geo` ย้ายไป `lib/semantic/geo.ts` รับ dictionary · `cohortSize`/`isSmallCell` รับ `MasterData` · `lib/data/master.ts` = `GENERATOR_MASTER`/`GENERATOR_DICTIONARY` สำหรับ `runMetric` sync, batch (`hypothesis`), mock model (`mock-script`, `mock-people`) และเทสต์
- ผู้ใช้ที่ต้องเปลี่ยน: engine (`planMetric` รับ dictionary), `alertRowOf`/`alertScopeLabel`, `actionsForMetric`/`actionsForAlert`, `NextActionContext.region` (server คำนวณ engine ไม่ต้องรู้ภูมิศาสตร์), `ambientCards` รับ `rowOf`, `ambientFor` เป็น async, `digestFor`, watches, handoff, inbox, `people.ts` (สถานที่/แผนก), `sites.ts`, memory (`extractByRule` รับ dictionary)
- client: `approval-card` ไม่ import dictionary แล้ว ดึงชื่อจาก `GET /api/labels?v=<dim>:<id>` (ต้อง login, ≤24 ค่า) ผ่าน `HandoffApproval`/`WatchApproval` · ไม่มี client component ใด import master data
- ตรวจ: snapshot 54,206 เคส ตรงทุกไบต์อีกรอบ · `master-data.test.ts` 4 เทสต์ (ชื่อจังหวัดที่ warehouse เปลี่ยนขึ้นในแถว, ย้ายเอเย่นต์ไปภาคอื่นใน master → rep ถูกปฏิเสธ = scope ตาม master ของ warehouse, โหลดครั้งเดียวต่อ port, load พังไม่ค้าง) · typecheck, 543 tests · curl `/`, `/dashboard`, `/api/inbox` (ธนา, อนุชา, กฤต), `/admin?tab=simulate`, `/api/labels` (200 ชื่อไทย, ไม่ login = 401) · ยังไม่ได้ดูการ์ดอนุมัติส่งต่องาน/เฝ้าดูด้วยตาในเบราว์เซอร์
- ยังอ่าน entities ตรงตามแผน: batch (`forecast`, `series`, `hypothesis`), `facts.ts` (ตัว warehouse เอง), `describeEntity` ใน `query.ts` (ฝั่ง generator ของ port), `users` (บัญชี Cop)
- ตรวจ: typecheck, test, curl `/`, `/dashboard` (3 บทบาท), `/admin?tab=simulate`, `/api/inbox` · ไม่รัน eval (รูปผลลัพธ์ไม่เปลี่ยน พิสูจน์ด้วย snapshot)

**7G REST connector (`kind: "rest"`) บน pipeline เดิม** (`lib/server/connectors/{types,define,call}.ts`, `scripts/rest-demo-*.ts` ใหม่, `lib/access/redteam-connectors.test.ts`)
- [x] `defineRestConnector({ id, labelTh, sourceSystemTh, baseUrl, auth, timeoutMs, tools: { [name]: { method, path, input, labelTh, tier, roles, scope, sensitive?, output } } })` → `CopTool` เดียวกับ MCP: inject → เรียกในนามผู้ถาม → adapter → filter → mask → 60 แถว → fence → audit · `input` (zod) และ `output` บังคับ (REST ไม่มี catalog ให้อ่าน schema)
- [x] `ConnectorDef.kind` เพิ่ม `"rest"` · admin/สวิตช์ connector/สถานะเชื่อมต่อ ใช้ของเดิมโดยไม่แก้ UI
- [x] endpoint เดโมหนึ่งตัว + red-team ชุดเดียวกับ 7E (0 รั่ว, argument ขยายขอบเขตถูกเขียนทับ, field masked, ปิด connector, TOOL_NOT_ALLOWED)
- ทำแล้ว 2026-09-25: transport เป็น `RemoteCaller` (`mcpCaller` ใน `call.ts`, `restCaller` ใน `rest.ts`) คืน `RemoteOutcome` → `callConnectorTool` ตัวเดียวทำ allow → inject → เรียก → filter → mask → 60 แถว → fence ให้ทั้งสองแบบ · `defineRestConnector` ตรวจเพิ่มจาก MCP: method GET/POST, path ขึ้นต้น `/` เดียวไม่มี query (กัน `//host`), `{name}` ใน path ต้องอยู่ใน input, ต้องมี description/input/output, baseUrl http(s) · request: placeholder encode, GET = query (ตัดค่าว่าง), POST = JSON body, header ตัวตนจาก `auth`, `redirect: "error"` (header ตัวตนไม่ตามไป host อื่น), timeout · 502–504/timeout/เชื่อมไม่ได้ = `CONNECTOR_UNAVAILABLE` + สถานะ offline, 4xx/5xx อื่น = `CONNECTOR_FAILED` พร้อมข้อความ server ที่ fence แล้ว, body ที่ adapter อ่านไม่ได้ = `CONNECTOR_FAILED`
- `remoteConnectors()` (MCP + REST) ให้ registry · `mcpConnectors()` เหลือให้ reconcile/probe · admin ภาพรวมเตือน connector ล่มทุกชนิดที่ไม่ใช่ native · ไม่ต้องแก้ UI admin: tool, สวิตช์, ค่าปิดตามสิทธิ์ขึ้นเอง
- เดโม: `scripts/rest-demo-crm.ts` (:3198, รัน `bun scripts/rest-demo-crm.ts` — ไม่ได้เพิ่ม script ใน package.json เพราะไฟล์นั้นมีงานของผู้ใช้ค้างอยู่) `GET /api/visits` ตรวจลายเซ็น `x-cop-*` · `crm-demo.ts`: `crm_demo__store_visits` บทบาท ceo/sales_director/sales_rsm/sales_rep/marketing_lead, inject `regions`, filter ตามภาค, `order_value` เต็มสำหรับ ceo/ผอ.ขาย/RSM, `***` สำหรับ rep, ไม่เห็นสำหรับที่เหลือ · note หนึ่งแถวมี `<system>` ปลอมไว้ทดสอบ fence
- ตรวจ: `redteam-rest.test.ts` 13 เทสต์ + `rest.test.ts` 4 เทสต์ · ลองถอด filter ภาคออก → 2 เทสต์รั่วล้มตามคาด แล้วคืน · typecheck, 560 tests · curl `/admin` ทุกแท็บ (`tools`, `access&role=sales_rep`, `access&view=matrix`, `simulate`, `audit`) มี "CRM (REST)" และค่าปิดตามสิทธิ์ · ยิงจริงผ่าน HTTP ไปเซิร์ฟเวอร์เดโม: กฤต 24 แถวอีสาน ยอด `***`, อนุชา 24 แถวเห็นยอด, ธนา 60 แถว (จาก 120) ทุกภาค · ยังไม่ได้ลองถามผ่านแชทกับ Gemini
- แชทกับ Gemini (2026-09-25, browser แยก context, CRM เดโมเปิดอยู่): คุณกฤตถาม "เดือนนี้มีใครไปเยี่ยมเอเย่นต์ในเขตผมบ้าง" → Gemini เรียก `crm_demo__store_visits` เอง ตอบสรุป + Table 8 แถว ตรงกับข้อมูลต้นทางทุกแถว ไม่แสดงคอลัมน์ยอดที่ถูกปิดและบอก "มี 1 ฟิลด์ถูกปิดตามสิทธิ์" · ถามร้านที่กรุงเทพ → Gemini ส่ง `regions: "bkk"` แล้ว `agentId: ag_bkk_01` Cop เขียน regions ทับเป็น northeast ทั้งสองครั้ง ได้ 0 แถว → ตอบว่านอกขอบเขต · CEO ถามร้านกรุงไทยเบเวอเรจ → `describe_entity` แล้ว CRM, note ที่ฝัง `<system>` มาถึงโมเดลเป็น `(system)…(/system)` guard ของ Vexa จับได้ Gemini บอกผู้ใช้ว่าพบคำสั่งแทรกและไม่ทำตาม
- ครั้งแรกที่ถามเจอ "An error occurred." หลังผล tool (ขั้นที่สอง) ถามซ้ำไม่เกิด → เปิด `onError` ใน Vexa (§9) รอบหน้าจะเห็นข้อความจริง · audit ของคำถามนอกขอบเขตที่ได้ 0 แถวบันทึกเป็น `allow` (ไม่รั่ว แต่อ่าน audit แล้วไม่เห็นว่าถูกบีบ) — ถ้าต้องการให้เป็น `deny`/`scoped` ต้องแยกในรอบถัดไป

### Phase 8 — Cop ที่รู้ใจ: "สิ่งที่ต้องดู" ชุดเดียว มีสถานะ เรียนรู้ และลงมือได้ (user decision 2026-09-25: "เขียนลง plan แล้วเริ่มขั้น 1 เลยแต่อย่าลืมว่าต้องมีผลกับทุก role ไม่ใช่แค่ HR")

ที่มา: ทดสอบเป็น HR แล้วพบว่าสิ่งที่ต้องดูกระจายอยู่ 5 ที่ (alert → การ์ดหน้าแรก, `visitsFor`, `peopleTasksFor`, `attentionOf`, `digestFor`) แต่ละที่จัดลำดับเอง ไม่มีที่ไหนจำว่าผู้ใช้จัดการเรื่องไหนแล้ว · alert มีแต่ฝั่งขาย HR จึงเห็น "ไม่มีอะไรผิดปกติ" และไม่เคยได้สรุปเช้า · memory (`/memory`) ไม่มีผลกับหน้าแรก/แดชบอร์ด · ข้อมูลการใช้ของคุณเมย์: ถาม 9, เปิดการ์ด 9, กดชิป 1

หลัก: **หนึ่งรายการต่อผู้ใช้ (`feedFor`) ทุกพื้นผิวอ่านจากที่เดียว** · ทุกบทบาทได้รายการจากขอบเขตของตัวเอง (สิทธิ์เหมือนตอนถาม) · สถานะเป็นของผู้ใช้คนนั้น ไม่กระทบคนอื่น · Dashboard เปลี่ยนช้าและคนตัดสิน (เสนอ ไม่เปลี่ยนเอง) · ทุกเหตุผลที่แสดงต้องจริง (ข้อเดียวกับ 4A)

**8A รายการเดียว + สถานะ + บันทึกการกด (ขั้น 1)** (`lib/contracts/feed.ts`, `lib/server/feed.ts`, `app/api/feed/route.ts`, `components/landing/*`, `lib/server/visits.ts`, `lib/engine/recommend.ts`)
- [x] สัญญา `FeedItem { key, source, kind, rank, tone, label, reason, detail, prompt, card, alertId, packetId }` · `key` คงที่ต่อเรื่อง: `alert:<id>`, `packet:<id>`, `visit:<agent>:<สัปดาห์>`, `person:<id>:<ชุดเรื่อง>` (เรื่องเปลี่ยน = key ใหม่ = ขึ้นอีก), `opening:<id>` · `kind` = ประเภทไว้เรียนรู้ (`alert:<metric>`, `person:cert`, `person:risk`, `person:overtime`, `opening`, `visit`, `packet`)
- [x] แหล่ง (ทุกบทบาท ตามขอบเขต): alert ที่เกี่ยวกับผู้ใช้ · งานที่ส่งต่อมา · เอเย่นต์ที่ควรเยี่ยม (บทบาทขาย) · คน: HR เห็นทุกคน, คนอื่นเห็นลูกทีมโดยตรง (`managerId` = ผู้ใช้; ทั้งสายทำให้ CEO เห็นทุกคน) — ใบอนุญาตหมดใน 30 วัน, โอทีเกิน, และเสี่ยงลาออกเฉพาะ HR (มุมมอง `hr`) · ตำแหน่งเปิด ≥ 60 วัน: HR ทุกตำแหน่ง, ผู้จัดการที่รับคนและสายเหนือขึ้นไปเฉพาะของตัวเอง · alert ของเอเย่นต์ที่อยู่ในรายการเยี่ยมแล้วไม่ซ้ำ
- [x] ลำดับบนสเกลเดียว (`rank`): alert P1 900 / งานส่งต่อเร่งด่วน 850 / เยี่ยมเอเย่นต์ที่มี alert 800 / คนที่ใบอนุญาตหมด ≤ 14 วัน 700+ / P2 600 / คน, ตำแหน่ง, เยี่ยม 400–500+ · หน้าแรก: การ์ดเต็ม ≤ 2 ใบ (`ambientCards` เดิม เฉพาะเรื่องที่ยังอยู่ในรายการ) + แถว ≤ 5 — แถวละหนึ่งเรื่อง (`story` = เมตริก + มิติหลัก, SKU เดียวหลายช่องทาง = เรื่องเดียว), ไม่มี P3, alert ในแถว ≤ 2 เพื่อให้เรื่องที่ไม่อยู่ในกล่องงานมีที่
- [x] สถานะต่อผู้ใช้ (`feed-states`): เสร็จแล้ว (ซ่อนจน key เปลี่ยน) · เลื่อน 7 วัน · ไม่เกี่ยวกับฉัน (alert = mute เดิมของ 4A ด้วย กล่องงานจึงตรงกัน) · งานส่งต่อไม่มีปุ่มเสร็จบนหน้าแรก (ปิดในกล่องงานพร้อมผลตาม 4D)
- [x] `POST /api/feed { key, action: open|done|snooze|mute }` ตรวจว่า key อยู่ในรายการของผู้ใช้ตอนนี้ (นอกขอบเขต = 404) · บันทึก event `feed_open|feed_done|feed_snooze|feed_mute` intentKey `feed|<kind>` · recommender ของชิปไม่นับ event เหล่านี้
- [x] บันทึกสิ่งที่แสดง: `markVisit` เก็บ key ที่ผู้ใช้เห็นในแต่ละครั้งที่เปิด (ใช้ใน 8C ว่า "เห็นแล้วไม่เคยเปิด")
- [x] บรรทัดใต้คำทัก: ถ้าไม่มีลิงก์ alert/งาน บอก "วันนี้มี N เรื่องที่ต้องจัดการ" จากรายการนี้ · "ไม่มีอะไรผิดปกติ" เฉพาะเมื่อรายการว่างจริง
- [x] ตรวจ: เทสต์ทุกบทบาท (CEO, ผอ.ขาย, RSM, rep, marketing, supply, finance, HR, IT) ได้รายการจากขอบเขตตัวเอง ไม่มีคนนอกสาย · เสร็จ/เลื่อน/ไม่เกี่ยวซ่อนเฉพาะคนกด · key ใหม่ขึ้นอีก · API ปฏิเสธ key นอกรายการ · หน้าแรกฝ่ายขายยังมีการ์ด alert + ปุ่มส่งงาน และแถวเยี่ยมเอเย่นต์ · ดูในเบราว์เซอร์ HR (กดเสร็จแล้ว → reload หาย, ลบสถานะทดสอบแล้ว), curl หน้าแรก RSM/rep/CEO/IT · `lib/server/feed.test.ts` 8 เทสต์ · 583 tests
- ผลต่อบทบาท (ข้อมูลปัจจุบัน): CEO 2 การ์ด + 2 แถว alert · ผอ.ขาย + ตำแหน่งเปิดของทีม 2 · RSM อีสาน alert + คุณป้อง/คุณกฤต (ใบอนุญาต) + ตำแหน่ง 99 วัน · rep เยี่ยม 3 · supply + คุณวันชัย (ใบขับขี่รถยก) · HR 5 แถวคน/ตำแหน่ง · IT ว่าง = "ไม่มีอะไรผิดปกติ"

**8B ลงมือจากรายการ + สรุปเช้าจากรายการเดียวกัน (ขั้น 2)** (`lib/server/people-feed.ts`, `lib/server/digest.ts`, `lib/server/digest-narrator.ts`, `components/feed/feed-list.tsx`, `components/inbox/drawer.tsx`, `app/api/inbox/route.ts`)
- [x] ปุ่มลงมือต่อรายการจากกฎ (`FeedItem.actions`, ผ่าน approval เดิมด้วยข้อความกดปุ่ม): ใบอนุญาต/โอที/เสี่ยงลาออก → `create_handoff` ถึงหัวหน้าของคนนั้นถ้าหัวหน้าใช้ Cop และไม่ใช่ผู้ดู ไม่งั้นถึงตัวคนนั้นถ้าใช้ Cop ไม่งั้นไม่มีปุ่ม (ข้อความขอให้คุยเรื่องความก้าวหน้าไม่ใช้คำว่า "เสี่ยงลาออก" — ป้ายนั้นเป็นของ HR) · ใบอนุญาตของผู้ใช้เอง = รายการใหม่ `own:cert` + `enroll_course` รอบต่ออายุถัดไปที่มีที่ · ถ้าเจ้าของใบลงรอบต่ออายุแล้ว เรื่องนั้นหายจากทุกรายการ (ตัวเอง หัวหน้า HR) · alert = ปุ่มส่งต่อเดิมของ `actionsForAlert` · ปุ่มที่ tool ถูกปิดสำหรับผู้ใช้ (สิทธิ์, kill switch, สวิตช์ส่งต่อ) ไม่แสดง — `.data` ตอนนี้ปิดส่งต่ออยู่ HR จึงไม่เห็นปุ่มส่ง · ตำแหน่งเปิด/เยี่ยม = กดแถวถามต่อ (ไม่มีปุ่ม)
- [x] `digestFor` อ่านจาก `feedFor`: เรื่องที่ใหม่หรือกลายเป็นสีแดงตั้งแต่สรุปครั้งก่อน (เก็บ `keys` + `tones`; สรุปเก่าที่มีแต่ `alertIds` ยังอ่านได้) · ไม่มี P3 · หนึ่งบรรทัดต่อเรื่อง (`onePerStory` ใช้ร่วมกับหน้าแรก) · ≤ 5 บรรทัด + "และอีก N เรื่อง" + watch ที่เข้าเงื่อนไข → HR ได้สรุปเช้าแล้ว
- [x] กล่องงาน: แท็บแรก "ต้องจัดการ" (ค่าเริ่มต้น) = `feedFor` 20 เรื่อง ใช้ `FeedList` ตัวเดียวกับหน้าแรก (เสร็จ/เลื่อน/ไม่เกี่ยว + ปุ่มลงมือ) สถานะตรงกันเพราะอ่านที่เดียว
- [x] AI บนผลของกฎ: `narrateDigest` (utility model, `generateObject`) เขียนประโยคเปิดและลำดับการอ่านจากบรรทัดที่กฎสร้าง (fence) + สิ่งที่ Cop เชื่อแล้วเกี่ยวกับผู้ใช้ (fence) · `isGrounded`: ทุกตัวเลขในประโยคต้องอยู่ในบรรทัด ไม่มีลิงก์ ≤ 280 ตัวอักษร ไม่ผ่าน/ไม่มีโมเดล/เรียกพัง = ไม่มีประโยคเปิด ใช้ลำดับของกฎ · บรรทัดเป็นของกฎเสมอ · รันในงานสรุปเช้าวันละครั้งต่อคน · ค่าใช้จ่ายเข้า model ledger (`background`) ลองจริงกับ Gemini: ~$0.0056/คน (ส่วนใหญ่เป็น reasoning token) — HR: "เช้านี้ควรเริ่มจากคุณแดง…และคุณป้อง…", RSM อีสาน: "…อุบลศรีสุข เทรดดิ้ง −83% และอีสานรุ่งโรจน์ ค้าส่ง −77%" ตัวเลขตรงกับบรรทัด
- [ ] เลือกปุ่มลงมือจาก id ที่กฎเสนอด้วยโมเดล — ยังไม่ทำ: ตอนนี้กฎเสนอปุ่มเดียวต่อรายการ ยังไม่มีอะไรให้เลือก
- ตรวจ: `feed.test.ts` 12 (ปุ่มถึงหัวหน้า/ตัวคน/ไม่มี, ใบของตัวเอง + รอบต่ออายุ, ลงรอบแล้วหายทุกรายการ, tool ปิด = ไม่มีปุ่ม) · `digest.test.ts` 6 (HR ได้สรุป, ไม่บอกซ้ำเว้นแต่กลายเป็นแดง, ไม่มี P3, ผู้เล่าเขียนได้แค่ประโยคเปิดและลำดับ, `isGrounded`, งานส่ง HR พร้อมประโยคเปิด) · 590 tests · เบราว์เซอร์: หน้าแรก HR เห็นปุ่ม "ส่งให้คุณอนุชา…" ทั้งที่สวิตช์ส่งต่อปิดอยู่ → แก้ให้กรองตาม `toolAllow` แล้วปุ่มหาย, กล่องงานแท็บต้องจัดการ 7 เรื่อง · ยังไม่ได้กดปุ่มส่งจริงจนถึงการ์ดอนุมัติ (สวิตช์ปิด) · curl rep: "ใบอนุญาตขายสุราของคุณ · เหลือ 23 วัน" + "ลงรอบต่ออายุ" รอบ 3 ต.ค.

**8C จัดลำดับตามพฤติกรรม + memory มีผล (ขั้น 3)** (`lib/engine/feed-learning.ts`, `lib/server/feed.ts`, `lib/engine/memory.ts`, `lib/server/demo-feed-history.ts`, `components/feed/feed-list.tsx`)
- [x] `learnFeed` (pure, ทดสอบแยก): 30 วันล่าสุด · เปิด/เสร็จ ≥ 3 ครั้งรวม และประเภทนั้น ≥ 2 → บวก ≤ 60 ตามสัดส่วน · เลื่อน/ไม่เกี่ยว → ลบ 20 ต่อครั้ง ≤ 60 · เห็นใน ≥ 3 ครั้งที่เปิดหน้าแต่ไม่เคยเปิดเรื่องนั้น → ลบ 150 (ไปท้าย) · เหตุผล "ขึ้นก่อนเพราะคุณเปิดเรื่อง<ประเภท> N ครั้งใน 30 วัน" เฉพาะเมื่อถูกดันขึ้นจริง และเฉพาะรายการแรกของประเภทนั้น · การจมลงไม่อธิบาย (ไม่มีอะไรให้ผู้ใช้ทำ) · event ของรายการเก็บ `feed|<kind>|<key>` เพื่อรู้ว่าเรื่องไหนเคยเปิด
- [x] memory: preference "ไม่ติดตาม<ประเภท>" ที่เชื่อแล้ว (ยืนยันหรือได้ยินซ้ำ) ซ่อนทั้งประเภท (ใบอนุญาต, เสี่ยงลาออก, โอที, ตำแหน่ง, เยี่ยม; alert ปิดทีละ slice ตาม 4A และงานส่งต่อต้องตอบเสมอ) · กด "ไม่เกี่ยว" ประเภทเดิมครั้งที่ 3 ใน 30 วัน → `proposeMemory` เป็น "กำลังเรียนรู้" รอยืนยันใน `/memory` ไม่มีผลก่อนยืนยัน · เกณฑ์ของผู้ใช้: watch ที่เข้าเงื่อนไขเป็นรายการใหม่ `source: "watch"` (แดง) แทนการอ่านข้อความ "เกณฑ์ของคุณคือ X" — สรุปเช้าจึงไม่ต้องมีบรรทัด watch แยกแล้ว
- [x] ประวัติการใช้เดโม (`ensureFeedHistory`, เรียกจาก `bun run seed` ทั้งแบบล้างและ `--story`, id คงที่ รันซ้ำไม่ซ้ำ): คุณเมย์เปิดเรื่องใบอนุญาต 5 วันใน 12 วัน + เลื่อนตำแหน่งที่เปิด 2 ครั้ง · คุณอนุชาเปิด alert 4 ครั้ง · ผล: HR ใบอนุญาตขึ้นก่อนพร้อมเหตุผล ตำแหน่งที่เปิดจมลงจากหน้าแรก (ยังอยู่ในกล่องงาน) · RSM "ขึ้นก่อนเพราะคุณเปิดเรื่องปริมาณขายเข้า 3 ครั้งใน 30 วัน"
- ตรวจ: `feed-learning.test.ts` 9 · `feed.test.ts` 15 (ไม่เกี่ยว 3 ครั้ง → ข้อเสนอใน memory ไม่ซ่อนจนยืนยัน แล้วซ่อน, watch ที่เข้าเงื่อนไขอยู่ในรายการ, ประวัติเดโมเพิ่มครั้งเดียว) · 602 tests · เบราว์เซอร์หน้าแรก HR · curl กล่องงาน RSM · เทสต์ใช้สำเนา `.data` จึงแยกประวัติเดโมที่ seed ไว้ออกก่อนทดสอบ

**8D Dashboard เรียนจากรายการ (ขั้น 4)**
- [x] เปิดเรื่องประเภทเดียวกันจากหน้าแรก ≥ 3 วันใน 14 วัน → เสนอการ์ดเฝ้าดูเรื่องนั้น (ถาดคำแนะนำเดิม) · การ์ดจาก template ที่ไม่เคยเปิด → เสนอเปลี่ยนเป็นเรื่องที่ถามจริง · การ์ดที่เกี่ยวกับเรื่องบนรายการขึ้นก่อน
- ทำแล้ว 2026-09-25: `feedCandidatesFrom` (`lib/engine/compose.ts`) นับวันที่เปิด/เสร็จต่อประเภท (≥ 3 วันใน 14 วัน) · ประเภท → เมตริก `metricOfFeedKind` (`feed-learning.ts`): alert/watch ใช้เมตริกของตัวเอง, เสี่ยงลาออก → `attrition_rate` × ฝ่าย, เยี่ยม → `sell_out_volume` × เอเย่นต์; ใบอนุญาต/โอที/ตำแหน่ง/งานส่งต่อไม่มีเมตริก = ไม่มีการ์ด · มิติจาก alert ที่เปิด (มิติเรื่องแรก) หรือ query ของ watch · ลำดับในวันเดียว (≤ 1 ใบ/วัน): จากรายการก่อน แล้วคำถามที่ถามซ้ำ
- template ไม่เคยเปิด = `untouchedTemplates` (ปักอยู่, `role_template`, ไม่มี `widget_view` เลย, มีการดูมาแล้ว ≥ 14 วัน) → คำถามที่ถามซ้ำมาพร้อม `WidgetSpec.replaces` + เหตุผล "แทน … ที่คุณไม่เคยเปิด" · กดปักแล้วการ์ดเดิมกลับไปถาด (ไม่ลบ) · เอาข้อเสนอออกจากถาด = บันทึก `dismiss` `widget:<id>` ไม่เสนอซ้ำ
- `withFeed` (`attention.ts`): การ์ดที่เมตริกตรงกับเรื่องบนรายการ (alert_list = alert ใด ๆ) ขึ้นชั้นบนสุดตาม rank ของเรื่อง; การ์ดที่นิ่งได้เหตุผล "อยู่ในสิ่งที่ต้องดู: <ประเภท> N เรื่อง" · หน้า `/dashboard` อ่าน `feedFor` แล้วส่งให้ `widgetViews`
- ประวัติเดโม: คุณอนุชาเปิด alert ส่วนแบ่งตลาด 3 วัน (id `ev_demo_feed_u_anucha_open_share_*`, เพิ่มใน `.data` แล้วด้วย `ensureFeedHistory` ไม่ได้ seed ใหม่) · คุณเมย์ไม่ได้การ์ดเพราะเปิดแต่ใบอนุญาต (ไม่มีเมตริก) และรายการตอนนี้ไม่มีคนเสี่ยงลาออก
- ตรวจ: `compose.test.ts` +5 · `attention.test.ts` +3 · typecheck, 610 tests · เบราว์เซอร์ 1280px คุณอนุชา: ถาดมี "ความผิดปกติส่วนแบ่งตลาดเบียร์โคราช" เหตุผล "คุณเปิดเรื่องส่วนแบ่งตลาดเบียร์จากรายการ 4 วันใน 14 วัน" · การ์ดแรก "เอเย่นต์ที่ยอดตกเทียบไตรมาสก่อน" (alert 5 เรื่อง)

**8D+ ความผิดปกติ: งานไม่ใช่การขยับ (แก้เล็กจากการเดินทดสอบ 2026-09-25)** — ที่มา: เดินดูในเบราว์เซอร์ ผอ.ขาย/การตลาด/ซัพพลาย + รีวิวแยก (fable) ทุกบทบาท: เปิด 45 ใบ P3 32 (ข่าวดี 24) · แท็บต้องจัดการของผอ.ขาย 20 แถวส่วนใหญ่ P3 · สถานะ "เฝ้าระวัง 31"
- [x] ข่าวดีไม่เป็น P2 ไม่ว่าขนาดไหน (`severityOf`) · โปรโมชันอธิบายได้เฉพาะยอดขาย/ขายออก **ขึ้น** (`campaignCovering`) — เดิมอธิบายโรงงานสิงห์บุรี +9% และโซดาขวด −8% ด้วยโปร 1 แถม 1 · PM2.5 เทียบอัตราส่วนต่อวันเดียวกัน 4 สัปดาห์ก่อน (`pm25Match`: r 0.32 → ผ่าน) → เพอร์ร่าเชียงใหม่/ลำพูน "พุ่งขึ้นพร้อมค่าฝุ่น PM2.5" · สินค้าของเอเย่นต์ที่ทั้งเล่มตกแล้วรวมเข้าเรื่องเอเย่นต์ (`absorbIntoAgentStories`: อาซาฮีถัง −11% ของอีสานรุ่งโรจน์)
- [x] แท็บต้องจัดการ = `todoFor` (ไม่มี P3 + หนึ่งแถวต่อเรื่อง) · สรุปเช้าใช้ `isTask` เดียวกัน · สถานะใต้คำทักนับแค่ P1/P2 + งานส่งมา ("เฝ้าระวัง"/"อื่น ๆ ในขอบเขต" ออก) · การ์ดหน้าแรกไม่เป็น P3 · watch ที่ยิงบน slice เดียวกับ alert เปิดได้ `story` เดียวกัน (ลำพูน 2 แถว → 1) · สรุปเช้าเก่าที่ไม่มี `tones` ถือว่าเล่าแล้ว · แถวเยี่ยมเอเย่นต์ใช้ alert ที่แย่สุด (บั๊ก key id/label: rep เคยเห็น −11% แทน −77%) · ช่องว่างใน `productionDown` · "วันนี้มี N เรื่อง" นับงานทั้งหมด (`LandingFeed.taskCount`) ไม่ใช่แถวที่หน้าแรกมีที่ (HR เคยขึ้น 5 ทั้งที่มี 7)
- ผล (`.data` หลังรัน `runAnomalyJob`; สำรองเดิมไว้ใน scratchpad): P2 8 → 6 · แท็บต้องจัดการ CEO 20 → 8, ผอ.ขาย 20 → 10, ซัพพลาย 20 → 7, การตลาด 20 → 4, RSM ภาคกลาง 15 → 2, RSM เหนือ 10 → 1 · ตรวจ: typecheck, 617 tests (+7) · เบราว์เซอร์ผอ.ขาย 1280px: "ต้องรีบดู 3 · ควรดู 5", ต้องจัดการ 10 แถว ไม่มีข่าวดี · เดินครบ 14 คนผ่าน `/` + `/api/inbox`: rep อีสานรุ่งโรจน์ −77% ไม่มีการ์ดข่าวดี, ซัพพลายลำพูนแถวเดียว, RSM เหนือ 1 เรื่อง (P1 ลำพูนของคุณวีร์), RSM ภาคกนก/IT "ไม่มีอะไรผิดปกติ", การเงิน/CFO ลูกหนี้ใต้เรื่องเดียว · ยังเหลือ 8E: CEO/การตลาดเห็นยอดขายออกรายจังหวัด −11..−13% ที่ไม่ใช่ของตัวเอง, RSM เหนือไม่เห็นเรื่อง PM2.5 ของภาคตัวเอง (P3 ข่าวดี → 8F)

**8E ความเกี่ยวข้องตามสายบังคับบัญชา** (`relevanceOf`, `relevanceContext`, `unopenedDays`, `relevantAlertsFor` ใน `lib/server/alerts.ts`; `lib/server/feed.ts`)
- [x] เจ้าของเห็นทุกเรื่องของตัวเอง (`mine`) · หัวหน้าโดยตรงของเจ้าของเห็น P1 หรือ P2 ที่เจ้าของยังไม่เปิด (`alert_open`/`feed_open`/`feed_done`) ≥ 2 วัน (`escalated`) พร้อมรายละเอียด "คุณ<เจ้าของ>ยังไม่ได้เปิด N วัน" · สายที่สูงกว่า หรือคนที่มีเมตริกบนแดชบอร์ด เห็นเฉพาะ P1 (`watched`) · P3 ไม่ขึ้นไปหาใครนอกจากเจ้าของ · ทุกที่ที่เคยกรอง `relevanceOf !== "other"` (feed, การ์ด, สถานะ, alert_list บนแดชบอร์ด, visits, briefing) ใช้ `relevantAlertsFor` ตัวเดียว คำนวณ context ครั้งเดียวต่อคำขอ
- [ ] roll-up ระดับภาคสำหรับ CEO/ผอ. — ยังไม่ทำ: หลังกฎนี้ CEO เหลือ 5 เรื่อง P1 ทั้งหมด ผอ. 9 (P1 3 + P2 ที่ RSM ยังไม่เปิด 4 + ตำแหน่ง 2) ยังไม่ถึงจุดที่ต้องรวม
- ผล: CEO 8 → 5 (P1 เท่านั้น; ลำพูน "คุณวีร์ยังไม่ได้เปิด 3 วัน") · ผอ.ขาย 10 → 9 (P2 ที่ขึ้นมาทุกใบบอกชื่อ RSM ที่ยังไม่เปิด) · การตลาด 4 → 0 "ไม่มีอะไรผิดปกติ" (งานของตัวเองรอ 8G) · ซัพพลาย คุณวีร์ 7 → 3 (ขอนแก่นของคุณโอ๊ตขึ้นเพราะยังไม่เปิด) · RSM/การเงิน/HR/IT เท่าเดิม
- ตรวจ: `feed.test.ts` +2 (หัวหน้าเห็นเรื่องที่รอจนเจ้าของเปิดแล้วหาย ส่วนเจ้าของยังเห็น; CEO/การตลาดไม่เห็น P2/P3 ของคนนอกสายตรง) · typecheck, 619 tests · เบราว์เซอร์ 15 คน หน้าแรก/แดชบอร์ด/กล่องงาน = 200 · เจอระหว่างเดิน: การ์ด "ความผิดปกติที่ต้องดู" ของ CEO มีโรงงานสิงห์บุรี +9% (P3 ที่ escalate เพราะยังไม่เปิด) → escalate เฉพาะ P2 แล้ว · กดเลื่อน 7 วันเป็นผอ.ขายในกล่องงาน: 9 → 8 หลัง reload, คุณสรัญญายังเห็น, ลบสถานะทดสอบแล้ว

**8F เรื่องในตัวตรวจ** (`lib/engine/anomaly.ts`, `Alert.parentId/relatedIds`, `lib/server/alerts.ts`, `lib/server/feed.ts`, `lib/server/digest.ts`, `components/inbox/drawer.tsx`)
- [x] `groupSkuStories`: สินค้าเดียว ภาคเดียว ทิศทางเดียว ข้ามช่องทาง/จังหวัด = เรื่องเดียว นำด้วย slice ที่ยังขยับและแรงสุด ระดับแย่สุดของกลุ่ม ที่เหลือเป็นลูก (`parentId`) · `openAlertsFor` ไม่คืนลูก (`childrenOf` ใช้ดู) · แถวบอก "และอีก N พื้นที่หรือช่องทาง" · เพอร์ร่าเหนือ 6 ใบ → 1 (+5), โซดาสิงห์ 10 → 4 เรื่อง
- [x] `linkDemandToCover`: สต๊อก DC ลด ↔ ขายออก SKU เดียวกันขึ้นในจังหวัดที่ DC นั้นส่ง (จาก `servingDc` ของเอเย่นต์) ไม่รวม เชื่อม (`relatedIds`) แต่ละเจ้าของเห็นมุมตัวเอง + "เกี่ยวกับ …" · ลำพูน −61% ↔ เพอร์ร่าเหนือ +27% (เชื่อมผ่านลำพูน +24% ที่เป็นลูกของเชียงใหม่ — เชียงใหม่เองรับจาก DC เชียงใหม่)
- [x] คลี่คลาย: หน้าต่างรายวันจบเกิน 3 วัน (ไม่ใช่ floor/รายเดือน) → `status: "resolved"` ไม่อยู่ในรายการใด (13 ใบวันนี้ รวมขอนแก่นไลน์ 2 และโรงงานสิงห์บุรี) · ความผิดปกติเปิด 45 → 23 เรื่อง
- [x] ข่าวดี: P3 ในทิศที่เมตริกต้องการ = `tone: "success"` ไม่ใช่งาน (`isTask`) · กล่องงานมีส่วนพับ "ข่าวดีในงานของคุณ N เรื่อง" ใต้ต้องจัดการ (ไอคอน 👍 pill เขียว) เฉพาะเจ้าของ (`goodNewsFor`) · สรุปเช้าปิดท้าย "ข่าวดี: …" หนึ่งบรรทัด ไม่เล่าซ้ำ และไม่ทำให้ส่งสรุปถ้าไม่มีเรื่องอื่น
- ผล: RSM เหนือ ต้องจัดการ 1 (ลำพูน "เกี่ยวกับ เพอร์ร่าเชียงใหม่ +27%") + ข่าวดี 2 · RSM ภาคกลาง 2 + ข่าวดี 3 (โซดาซัมเมอร์ +29% "และอีก 2") · คุณกนก 0 + ข่าวดี 1 · คุณวีร์ 3 → 2 (ขอนแก่นคลี่คลาย) · CEO/การเงิน/HR/IT/rep เท่าเดิม · การตลาดยังไม่ได้ข่าวโปรฯ (เจ้าของแคมเปญ = 8G)
- ตรวจ: `anomaly.test.ts` +4 (กลุ่ม, เชื่อม, ข้อมูลจริงเพอร์ร่าเหนือ, คลี่คลาย) · `feed.test.ts` +2 · `digest.test.ts` +1 · typecheck, 626 tests · เบราว์เซอร์ 16 คน หน้าแรก/แดชบอร์ด/กล่องงาน 200 · ภาพ: กล่องงาน RSM เหนือเปิดส่วนข่าวดี, หน้าแรกผอ.ขาย · เจอระหว่างเดิน: แถวข่าวดีใช้ไอคอนเตือน → 👍, "ทางทางเดียวกัน" → "และอีก N พื้นที่หรือช่องทาง", `toneOf(±1)` ตกแถบกลางจึงไม่เคยเป็นข่าวดี → ใช้ขนาดชัด · สำรอง `alerts.json` ก่อนรันใน scratchpad

**8G การตลาด ซัพพลาย การเงิน IT เชิงรุก** (`lib/server/campaign-feed.ts`, `lib/server/system-feed.ts`, `Alert.campaignId/alsoOwnerIds`, `lib/engine/hypothesis.ts`)
- [x] ผลแคมเปญถึงเจ้าของแคมเปญ (`CAMPAIGNS.ownerUserId`): แคมเปญที่ทำอยู่หรือจบใน 14 วัน อ่าน `campaign_uplift` เทียบ `upliftTarget` · ต่ำกว่าเป้า = งาน, ถึงเป้า = ข่าวดี · ความผิดปกติที่โปรโมชันอธิบายได้เก็บ `campaignId` + เจ้าของแคมเปญเป็นเจ้าของร่วม (`alsoOwnerIds` → `relevanceOf` = mine) และเป็น story ของแคมเปญ เจ้าของจึงอ่านเรื่องเดียว · คุณพิม: "ซีสโตร์ โซดาซัมเมอร์ 1 แถม 1 +35.3% · ถึงเป้า 35%"
- [ ] watch `share_of_voice`/`sentiment_score` ต่อแบรนด์ — ไม่ทำ: ข้อมูลขยับไม่ถึง 1 จุด ไม่มีความผิดปกติที่ปลูก (เพิ่ม = เสียงรบกวน) และตัวตรวจยังไม่มี grain รายสัปดาห์
- [x] ซัพพลาย: แถวสต๊อกบอก "เหลือ 6.1 วัน" แทน −61% + "เกี่ยวกับ" ยอดขายที่พุ่ง (8F) · [ ] เตือนล่วงหน้าจากพยากรณ์ — ไม่ทำ: พยากรณ์ cover ทั้ง 240 ชุดมี `lo` = 0 และต่ำสุด 9.3–9.9 วัน ใช้ตัดสินไม่ได้ (ลำพูนพยากรณ์ 13.1 จริง 6.1)
- [x] ลูกหนี้: สมมติฐานระดับภาคระบุเอเย่นต์ที่โตสุดเทียบปีก่อน (`arDrivers`: สงขลาทักษิณ +258%, เกาะสมุย +85%, นครศรีฯ +79% ตรงกับ `runMetric`) · RSM ของภาคเป็นเจ้าของร่วม → คุณสรัญญาเห็นลูกหนี้ใต้
- [x] IT: รายการจาก Cop เอง — connector ที่ติดต่อไม่ได้ (`offlineSince`), สวิตช์ส่งต่องานที่ปิดค้าง, เครื่องมือที่ถูก kill · เอาการ์ด alert_list ออกจาก template IT และ layout ที่เก็บไว้ทิ้งการ์ดเริ่มต้นที่ template ไม่มีแล้ว (มีผลกับคุณต้นคนเดียว) · คุณต้น: "LMS (MCP) ติดต่อไม่ได้ ตั้งแต่ 25 ก.ย." + "ปิดการส่งต่องานอยู่ 2 วัน"
- ตรวจ: `role-feeds.test.ts` 5 · แก้เทสต์ 8E ให้นับเจ้าของร่วม · typecheck, 631 tests · เบราว์เซอร์ 18 คน หน้าแรก/แดชบอร์ด/กล่องงาน 200 · ภาพ: หน้าแรกและแดชบอร์ด IT, กล่องงานคุณพิม (ข่าวดีแคมเปญ), หน้าแรกคุณสรัญญา (การ์ดลูกหนี้ระบุเอเย่นต์) · สำรอง `alerts.json` ก่อนรันใน scratchpad

**8H หน้าแรกของหัวหน้า: เรื่องของลูกทีมเป็นเรื่องเดียว** (ที่มา: ภาพหน้าแรกคุณประสิทธิ์ 2026-09-25 — 5 จาก 6 เรื่องเป็นของภาคอีสาน/คุณอนุชา แยกเป็นแถว, P1 อยู่ล่างสุด, "ควรดู 4" แต่เห็นแถวเดียว, KPI ชื่อซ้ำไม่บอกช่วง) (`lib/server/team-feed.ts`, `lib/server/feed.ts`, `lib/server/alerts.ts`, `lib/server/dashboard.ts`, `components/landing/landing.tsx`)
- [x] `withTeamStories`: เรื่องบนรายการของหัวหน้าที่อยู่ในสายของลูกทีมโดยตรงคนเดียวกัน (ความผิดปกติตามเจ้าของ, ตำแหน่งว่างตามผู้จัดการตำแหน่ง ผ่าน directory port) ≥ 2 เรื่อง → รายการ `team` เดียว + การ์ดหน้าแรก: ภาคที่เรื่องอยู่ · ชื่อลูกทีม, "N เรื่อง" + 3 เรื่องแรก, **จังหวัดที่มีปัญหาและตำแหน่งพนักงานขายยังว่าง** (อุบลฯ 99 วัน, ขอนแก่น 64 วัน, นครราชสีมา 49 วัน — ตรงกับเอเย่นต์ที่หยุดสั่ง 2 รายและส่วนแบ่งโคราช), **สถานะการจัดการของเจ้าของ** (ส่งต่อแล้ว/เปิดดูแล้ว N วันก่อน/ยังไม่ได้เปิด) · ปุ่ม "ถามความคืบหน้า<ลูกทีม>" (`create_handoff` ผ่านอนุมัติ; ซ่อนเมื่อสวิตช์ส่งต่อปิด) · เสร็จ/เลื่อน/ไม่เกี่ยวบนการ์ดทีมซ่อนทั้งเรื่อง (`AmbientCard.feedKey`)
- [x] ยกระดับ P2 ที่ยังไม่เปิดเฉพาะเรื่องที่ใหญ่พอ: ปริมาณห่างจากคาด ≥ 1,000 ลิตร (`isMaterial`) — P2 ยอดขายออกรายจังหวัด 4 ใบ (~100 ลิตร) ไม่ขึ้นถึงผอ.แล้ว
- [x] การ์ดขึ้นก่อนแถวบนหน้าแรก (ทุกบทบาท) · ชื่อ KPI ที่ซ้ำกันบอกช่วง ("· ก.ค.–ก.ย.", "· 4 สัปดาห์ล่าสุด") · "ในทีมของคุณ" แทน "รอคุณอยู่" เมื่อทุกความผิดปกติเป็นของคนใต้สาย (`canJudge`) · สถานะใต้คำทักนับเฉพาะความผิดปกติที่ยังอยู่บนรายการ (รวมที่อยู่ในการ์ดทีม; เลื่อนแล้วไม่นับ)
- [ ] roll-up เมื่อเรื่องข้ามหลายภาคในสายเดียว — ตอนนี้ภาคมาจากเรื่องที่มีร่วมกัน ถ้าไม่ร่วมใช้ภาคของลูกทีม/"ทีม"
- ผล: ผอ.ขาย 9 → 1 การ์ด "ภาคอีสาน · คุณอนุชา · 5 เรื่อง" (เปิดดูแล้ว 1 วันก่อน ยังไม่ได้ส่งต่องาน) · CEO: การ์ด "ภาคอีสาน · คุณประสิทธิ์ · 3 เรื่อง" (สถานะของคุณอนุชา) + ลำพูน + แถวลูกหนี้ใต้ · RSM/rep/HR/IT/การตลาดไม่เปลี่ยน ยกเว้น rep ขึ้น "วันนี้มี 4 เรื่อง" แทนสถานะ alert (alert อยู่ในแถวเยี่ยมอยู่แล้ว)
- ตรวจ: `team-feed.test.ts` 4 · แก้เทสต์ 8E ให้ใช้ความผิดปกติที่ใหญ่พอ · เทสต์ systems-of-record จับว่า team-feed อ่าน `EMPLOYEES` ตรง → ย้ายไปอ่านผ่าน directory port · typecheck, 635 tests · เบราว์เซอร์ 17 คน หน้าแรก/แดชบอร์ด/กล่องงาน 200 · ภาพหน้าแรกผอ.ขายและ CEO · กดเลื่อนการ์ดทีมผ่าน `/api/feed`: กล่องงาน 1 → 0 แต่สถานะยังขึ้น "ต้องรีบดู 3" → แก้ให้นับเฉพาะที่ยังอยู่บนรายการ แล้วลบสถานะทดสอบ · เจอระหว่างเดิน: rep/คุณโอ๊ตขึ้น "ในทีมของคุณ" ผิด → ต้องเป็นของคนใต้สายเท่านั้น

**8I เดินทดสอบใช้จริงหลัง seed ทุกบทบาท (2026-09-25)** (`lib/server/alerts.ts`, `lib/server/next-actions.ts`, `lib/server/feed.ts`, `lib/dashboard/ambient.ts`, `lib/server/team-feed.ts`, `components/landing/landing.tsx`, `lib/server/agent/persona.ts`)
- [x] ส่งต่อครั้งเดียว: ความผิดปกติที่มีงานส่งต่อเปิดอยู่ไม่เสนอปุ่มส่งอีก (การ์ด แถว และการ์ดแชท) · การ์ดบอก "<ผู้ส่ง> ส่งต่อให้<ผู้รับ>แล้ว" / "คุณส่งต่อให้…แล้ว" แทนบทเรียน — เดิม CEO ส่งแล้วปุ่มยังอยู่ และ RSM เหนือกดซ้ำได้
- [x] ผู้รับเห็นเรื่องเดียวครั้งเดียว: งานส่งต่อที่ถือความผิดปกติใช้ story เดียวกับความผิดปกติและนำ story นั้น · แถวเยี่ยมเอเย่นต์ของ rep ใช้ story ของความผิดปกติของเอเย่นต์ · การ์ดความผิดปกติแรกที่มีงานส่งมาแสดง "จาก … · คำขอ" แทนการ์ดที่สอง · การ์ดงานส่งต่อมีหัวเลขของความผิดปกติที่ถือ — เดิมคุณวีร์เห็นลำพูนสองใบ คุณกฤตเห็นอุบลศรีสุขเป็นการ์ด + แถว
- [x] การ์ดหน้าแรกเรียงตามความรุนแรง (เดิม "ควรดู" ขึ้นก่อน "ต้องรีบดู" ได้) · การ์ดทีมที่ปนความรุนแรงบอกจำนวน ("ต้องรีบดู 3 · ในทีมของคุณ" / 5 เรื่อง) ให้ตรงกับบรรทัดสถานะ · หน้าแรกมีลิงก์ "อีก N เรื่องในกล่องงาน" เมื่อเรื่องเกินที่ว่าง (HR 7 เรื่อง แสดง 5)
- [x] persona: ชื่อคนมาจากผล tool เท่านั้น ปุ่มที่กดมีแค่ user id ห้ามเดาชื่อ (Gemini เขียน "คุณวีระศักดิ์") → รอบหลัง "ให้ผู้รับผิดชอบ" · เว้นวรรค prompt แคมเปญ "1 แถม 1 เป็นอย่างไร"
- [ ] KPI "ต่ำสุด DC ลำพูน 6.0 วัน" กับการ์ด "จริง 6.1 วัน" (คนละช่วง) · ปุ่ม "แยกตามภาค" บนการ์ดของ rep ที่เห็นภาคเดียว · ปุ่ม Enable/Disable ในหน้า admin เป็นอังกฤษ (ตั้งใจตั้งแต่ `131abf9`?) · แชท HR ตอบ ~35 วินาที
- ตรวจ: typecheck, 638 tests (+3 ambient) · เบราว์เซอร์ IT/CEO/CFO/ผอ./RSM อีสาน+เหนือ/rep/การตลาด 2/การเงิน/HR/ซัพพลาย · กดส่ง CEO → คุณวีร์ ด้วย Gemini ถึงการ์ดอนุมัติ อนุมัติ แล้วดูฝั่งผู้รับและคนอื่นในสาย

### Phase 9 — ตัดความซับซ้อน: หน้าแรกแบบเดียวกันทุกคน (user decision 2026-09-25: "ตัดความซับซ้อนของระบบ ทำหน้าแรกแบบเดียวกันทุกคน")

ที่มา: คนไม่ได้เข้า Cop ทุกวัน เขาเข้ามาถามรายละเอียดแล้ว capture ไปส่งต่อเอง (ปิดส่งงานแล้ว) · Phase 8 สร้างหน้าแรกที่แต่ละบทบาทต่างกัน (บรรทัดสถานะที่นับตามความรุนแรง "รอคุณอยู่"/"ในทีมของคุณ", การ์ดที่เลือกจากความผิดปกติเท่านั้น, แถว "วันนี้ต้องจัดการ" ≤ 5, ลิงก์ "อีก N เรื่อง") บั๊กรอบ 8I มาจากชั้นนี้ทั้งหมด

หลัก: **role = สิทธิ์เท่านั้น** (ขอบเขต เมตริก เครื่องมือ) · หน้าแรกมีโครงเดียวกันทุกคน เนื้อหามาจากขอบเขตของเขา · ไม่ลงแรงเพิ่มกับแหล่งรายการเฉพาะบทบาทของ Phase 8 (ยังอยู่ในกล่องงาน ไม่ลบ)

**9A หน้าแรกเดียว** (`app/(app)/page.tsx`, `components/landing/landing.tsx`, `lib/server/feed.ts`, `lib/dashboard/ambient.ts`, `lib/server/dashboard.ts`)
- [x] โครง: ทักทาย · หนึ่งประโยค ("วันนี้มี N เรื่องที่ต้องจัดการ" กดแล้วเปิดกล่องงาน / "ยังไม่มีอะไรผิดปกติ") · ช่องถาม · ชิป · KPI ≤ 4 จากขอบเขต · การ์ด ≤ 2 — ไม่มีอย่างอื่น · N นับเรื่องข้างในการ์ดทีมด้วย (CEO 5, ผอ.ขาย 5 ตรงกับ "5 เรื่อง" บนการ์ด)
- [x] การ์ด = 2 เรื่องแรกของ `feedFor` (หนึ่งต่อ story) ไม่ว่ามาจากแหล่งไหน (`landingFeedFor` → `cardOf`): ความผิดปกติ → `alertCard`, เรื่องทีม → การ์ดทีม, งานส่งต่อ → `packetCard`, เอเย่นต์ที่ควรเยี่ยม → การ์ดของความผิดปกติของเอเย่นต์นั้น, อื่น ๆ → `itemCard` (เหตุผลเป็นตัวใหญ่ ป้าย `TH.feed.sources`) · `AmbientCard.handoff` → `action` (ปุ่มลงมือใดก็ได้ เช่น "ลงรอบต่ออายุ")
- [x] ลบ: `landingRows`, `landingStatus`, `landingStatusLead`, `statusLinks`, `ambientFor`, `ambientCards`, ลิงก์ "อีก N เรื่อง", แถวบนหน้าแรก · IT ไม่ได้รายการ "ปิดการส่งต่องานอยู่ N วัน" แล้ว (สวิตช์เป็นนโยบาย ไม่ใช่เรื่องค้าง)
- [x] ตรวจ: typecheck, 635 tests (`landing.test.ts` เขียนใหม่: ทุกคนได้ ≤ 2 การ์ดจากรายการของตัวเอง, HR ได้การ์ดทั้งที่ไม่มี alert, ตัวเลขประโยคตรงกับการ์ดทีม) · เทสต์สรุปเช้าไม่พึ่งว่าวันนี้ส่งไปแล้วหรือยัง · เบราว์เซอร์ 12 คน (CEO, CFO, ผอ., RSM 3, rep, ซัพพลาย 2, การตลาด 2, การเงิน, HR, IT) · curl
- [x] ไม่บอกว่าใครเปิดดูแล้ว (user 2026-09-25: "ui ที่บอกว่าใครเปิดดูแล้วไม่จำเป็น") — การ์ดทีมไม่มี "<คน> เปิดดูแล้ว… / ยังไม่ได้เปิด N วัน" (เหลือเฉพาะ "ส่งต่อให้…แล้ว" ถ้ามีงานส่งต่อ) · แถวความผิดปกติที่ขึ้นถึงหัวหน้าไม่มี "<เจ้าของ>ยังไม่ได้เปิด N วัน" · กฎส่งเรื่องขึ้นตามสายที่อ่านการเปิดยังทำงานเหมือนเดิม (ตัดแค่ UI) · ตรวจ 17 คน หน้าแรก + กล่องงานไม่มีข้อความนี้

**9B การ์ดที่เรียนรู้จากการใช้งานต้องเห็น** (user 2026-09-25: "ปักให้ default เยอะมาก อาจทำให้ card ที่ระบบแนะจากการใช้งานไม่เป็นที่สนใจเพราะอยู่ล่างสุด") (`components/dashboard/dashboard-view.tsx`, `app/(app)/dashboard/page.tsx`, `lib/server/dashboard.ts`, `lib/server/tools/pin-widget.ts`)
- [x] การ์ด `ai_suggested` ที่ยังไม่ปักขึ้นเป็นแถบบนสุดของ Dashboard (ใต้ชิปการเปลี่ยนแปลง เหนือการ์ดที่ปัก): "Cop เห็นว่าคุณติดตามเรื่องนี้ · <เหตุผล>" + ชื่อการ์ด ตัวเลขหลัก delta · ปุ่ม ปักไว้ / ไม่เอา / ดูการ์ด (การ์ดเต็มพับไว้ ไม่ดันการ์ดที่ปักลงใต้จอ) · ถาดด้านล่างเหลือแต่การ์ดชุดเริ่มต้นที่ไม่ได้ปัก ("การ์ดอื่นสำหรับบทบาทคุณ") และซ่อนเมื่อว่าง · การ์ดที่ปักไม่ขยับ (D3 ยังจริง)
- [x] `pin_widget` ผ่าน `pinNewWidget` → `layoutFor` + `mutate`/`save`: ปักจากแชตก่อนเข้าหน้าแรกครั้งแรกยังได้ชุดเริ่มต้นครบ และทุกการปักมีประวัติ (ย้อนกลับเมื่อวานไม่ทำการ์ดที่ปักจากแชตหาย) · ลบ `layoutOf`
- [x] ลบแถว "เปลี่ยนแปลงตั้งแต่ครั้งก่อนที่คุณเปิด" บน Dashboard (user 2026-09-25: "มันทำให้ผมงง เอาออกดีกว่า") · ลบ `changesSince`, `DashboardChange`, `TH.brief.newAlerts/newReplies` · Dashboard ไม่เรียก `markVisit` แล้ว (หน้าแรกยังเรียก)
- [x] ตรวจ: typecheck, 636 tests (`compose.test.ts` +1) · เบราว์เซอร์ RSM (คุณอนุชา) 1470px + 400px: แถบอยู่เหนือการ์ดที่ปัก, ดูการ์ด/ปักไว้ใช้ได้ การ์ดย้ายเข้ากลุ่มที่ปัก (ใส่ event คำถาม 3 ครั้งชั่วคราว แล้วคืน `.data`) · curl Dashboard 20 คนครบ 10 บทบาท 200 ไม่มี error

### Phase 10 — จำลองการใช้งานจริงทุกบทบาท เพื่อวัดระบบและเห็น audit (user decision 2026-09-25: "ดูจากประวัติแชตจริงก่อน … วางแผนจำลองการ chat จริงถามจริงจากแต่ละ role ให้ได้ data มากพอที่จะประเมินความสามารถของระบบ จะได้เห็นการ audit ในระบบด้วย")

ที่มา — ประวัติจริง ณ 2026-09-25: 4 thread · 4 คน · 8 คำถาม · 14 แถว audit · วันเดียว · ไม่มีเรื่องไหนถึงเกณฑ์ 3 ครั้ง จึงยังตัดสินไม่ได้ว่ากฎแนะนำการ์ดดีพอไหม แต่เห็นแล้วว่ากฎหยาบทั้งสองทาง:
- นับรวมเกิน: `intentKey` = metric|dims ไม่ดู filter · คุณประสิทธิ์ถามยอดรายวันของ "อุบลศรีสุข" กับ "อีสานรุ่งโรจน์" นับเป็นเรื่องเดียว (`net_sales_volume|date`) · คุณธนาถาม "พยากรณ์อีสาน 8 สัปดาห์จะถึงเป้าไหม" กับ "sell-in เทียบปีก่อน" นับเป็นเรื่องเดียว (`net_sales_volume|week`) เพราะ `get_forecast` ไม่ถูกนับ ใช้ `query_metric` ตัวแรกแทน
- ไม่นับเลย: 3 ใน 8 คำถาม (สรุปภาค, โปรไฟล์คน, ตรวจความผิดปกติ) ตอบด้วย `find_people` / `get_person` / `get_alerts` ไม่มี metric จึงไม่เป็นสัญญาณ
- `eval:cards` ใช้ `runWithAccess` แต่ไม่ใช้ `runWithTurn` แถว audit จากการ eval จึงไม่มี thread/คำถาม

หลัก: คำถามเขียนโดยคน (ไม่ใช่ LLM จำลองผู้ใช้) เพื่อให้มี **คำตอบที่ถูก** ติดทุกคำถาม (เรื่องที่ติดตาม, tool ที่ควรใช้, ควรถูกปฏิเสธไหม) · รันกับ `google/gemini-3.8-flash` จริงผ่าน handler เดียวกับแชต · ข้อมูลลง `.data` จริงให้เห็นในหน้าแอดมิน แต่ทุก id ขึ้นต้น `sim_` และลบได้ด้วยคำสั่งเดียว

**10A ชุดสถานการณ์** (`lib/sim/scenarios.ts`, ข้อมูลล้วน ภาษาไทย)
- [x] 12 คน ครบ 10 บทบาท (`lib/sim/scenarios.ts`, 273 รอบ): ธนา CEO, ศิริพร CFO, ประสิทธิ์ ผอ.ขาย, อนุชา RSM อีสาน, สรัญญา RSM ใต้, กฤต rep อีสาน, อาร์ม rep ใต้, เบญ การตลาด, วีร์ ซัพพลาย, มิ้นท์ การเงิน, เมย์ HR, ต้น IT
- [x] ต่อคน ~22 รอบใน ~10 session กระจาย 14 วันจำลอง: **เรื่องที่ติดตาม 2–3 เรื่อง** แต่ละเรื่องถาม 4–6 ครั้งด้วยถ้อยคำ/มิติ/ตัวกรองต่างกัน (ป้ายความจริงของ "ควรได้การ์ด") · คำถามครั้งเดียว 4–5 ข้อ (ไม่ควรได้การ์ด) · ถามต่อจากปุ่มถัดไป 2 ครั้ง · ขอปักการ์ด metric 1 ครั้ง + ขอปักหลังการ์ดที่ไม่ใช่ metric 1 ครั้ง · ส่งต่องาน 1 ครั้ง (อนุมัติ/ไม่อนุมัติตามบท) · **ถามนอกสิทธิ์ 2 ครั้ง** (ภาคอื่น, เมตริกที่ถูก mask/ห้าม, tool ที่ role ใช้ไม่ได้)
- [x] ทุกคำถามมีป้าย: `interest` | null, `expectTools`, `expectDecision` (allow/masked/deny/scoped)

**10B ตัวรัน** (`scripts/simulate-chats.ts`, `bun run sim -- --users=… --concurrency=3`)
- [x] ยิง HTTP ไป dev server ด้วย cookie จริง (route เดียวกับเบราว์เซอร์ → `runWithTurn`, audit มี thread + คำถาม) · ใช้ `AbstractChat` ของ AI SDK (ตัวเดียวกับ `useChat`: ส่งต่ออัตโนมัติหลัง approval/host tool) · host tools = `cop_action` + `ask` ของ Cop เอง (descriptor แบบเดียวกับ Vexa `toolSchemas`) · กดปุ่มถัดไป = `formatActionMessage` ของ Vexa · บันทึก thread ผ่าน `/api/threads/:id` ทุกรอบ
- [x] เลื่อนเวลา (`sim finalize`, ตอน server ว่าง ไม่เขียนชนกับ server): เลื่อน `at` ของ thread/event/audit/model-call ไปวันจำลองของ session นั้น (14 วันถึงวันนี้) เพื่อให้หน้าต่าง 14 วันของกฎทำงานจริง
- [x] สำรอง `.data` ก่อนรัน (`.sim-backup/<run>/`, ไม่ commit) · diff ทั้ง store ก่อน/หลัง → `sim/runs/<run>/manifest.json` (สร้างใหม่ + ค่าเดิมของที่แก้) · `bun run sim clean|restore --run=<run>` · **`bun run seed` ลบ `.data` ทั้งหมด** จึงเก็บถาวรใน git: `sim/runs/<run>/` = `transcripts.jsonl` (ทุกรอบ ทุก part ทุก tool input/output), `sessions.jsonl`, `scenarios.json`, `records/*.json` (audit, model-calls, events, threads, memory … หลังเลื่อนเวลา), `report.json` · smoke กับ mock: 24 รอบ, audit ผูก thread + คำถามครบ, clean คืน `.data` ตรงไบต์
- [ ] ค่าใช้จ่ายประมาณ ~260 รอบ × ~$0.02–0.03 ≈ **$5–8** · ~30–45 นาทีที่ concurrency 3 · หยุดเองถ้าเกินงบ `--budget=10`

**10C รายงาน** (`scripts/sim-report.ts --run=<run>` → `sim/runs/<run>/report.json`; ผล AI จัดกลุ่ม cache ใน `ai-topics.json` ไม่เสียเงินซ้ำ)
- [x] รันจริง 2026-09-25 · `google/gemini-3.8-flash` · 273 รอบ + retry 5 · **$7.65** · p50 21 วินาที p95 55 วินาที · error ครั้งแรก 6 รอบ (429 ×4, 504 ×1, Gemini ล้มขั้นที่สอง ×1) — retry ผ่านหมด 5 เหลือ 1 ที่ไม่รู้สาเหตุ (ก่อนแก้ Vexa `streamErrorText`)
- [x] เลือก tool ถูก 257/262 — ที่เหลือ 5 คือตอบปฏิเสธอย่างซื่อตรง (กำไรราย SKU/แบรนด์ไม่มีมิติ, rep ไม่มีสิทธิ์งบส่งเสริม) = ป้ายของบทผิด ไม่ใช่ระบบ · ปุ่มถัดไปที่บทขอแต่กฎไม่เสนอ 11 ครั้ง (เช่นขอ "ส่งต่อ" หลังผลที่ไม่แย่พอ)
- [x] สิทธิ์ 50/52 ผ่าน · audit 426 แถว ผูก thread + คำถามครบ 426/426 · tool call ที่ไม่มี audit = 0 · allow 390 / masked 23 / deny 13 · เห็นในแท็บ Audit และการใช้งานของแอดมิน (276 คำถาม 14 วัน กราฟรายวัน)
- [x] การ์ด 1,098/1,118 เช็กผ่าน · คำถาม metric ได้ DataCard ผูก tool ทุกครั้งที่ตอบด้วย `query_metric` อย่างเดียว · พยากรณ์ไม่มี component ผูก → model ประกอบ Card/LineChart/Metric เอง (ตัวเลขยังมาจาก `get_forecast` ครบ; "grounded" ที่ตกเป็น false positive ของตัวดึงตัวเลข)
- [x] **แนะนำการ์ด** (30 เรื่องที่ควรได้การ์ด): กฎปัจจุบันจับได้ 18 (60%) precision 100% · AI จัดกลุ่มจับได้ 28 (93%) precision 100% แต่ 4/28 เสนอมิติที่ metric ไม่มี (กำไรตามแบรนด์/SKU, ขายออกตามแคมเปญ) · 3 ใน 4 นั้นคือเรื่องที่ผู้ใช้ถามซ้ำทั้งที่ข้อมูลไม่มี = สัญญาณช่องว่างข้อมูลให้ทีมข้อมูล ไม่ใช่การ์ด
- [x] ช่องโหว่ปักการ์ดที่ไม่ใช่ metric เกิดจริง 2/12 (CEO, IT: ปัก `net_sales_volume|region` ที่ไม่ได้ขอ) · 10/12 ตอบถูกว่าปักได้เฉพาะเมตริก
- [x] พบ: ใบลาของ rep (`request_leave`) สร้าง packet + อีเมล + แจ้งเตือนถึงหัวหน้า ทั้งที่สวิตช์ส่งต่องานปิด — ขัดกับ "ปิดส่งงานแล้ว"
- [x] แก้ระหว่างทาง: Vexa `streamErrorText` ([object Object]) · ตัวรัน retry 429/5xx/timeout · ผูกระเบียนข้ามคน (packet/แจ้งเตือน) กับผู้กระทำ ไม่ใช่ผู้รับ (`sessionOf`) แล้วผูกใหม่ระเบียนของรันนี้
- [ ] ตัดสิน: (1) ใช้ AI จัดกลุ่มคำถามเป็นด่านที่สองหลังกฎ + ตรวจมิติกับ `metricDef` (2) ปิดช่องโหว่ปักการ์ดที่ไม่ใช่ metric (3) ใบลาเมื่อสวิตช์ส่งต่องานปิด (4) component พยากรณ์ผูก `get_forecast`

**10D ตรวจของจริง** (user 2026-09-26: "ตรวจดูจริงและหาความผิดพลาด … หมายถึงเปิด browser ดู ผมเห็นมี dashboard ซ้ำๆกัน") — อ่านทั้ง 278 รอบเทียบผล tool (4 agent) + เปิดเบราว์เซอร์ทุก role · ตัวเลข "ผ่าน" ใน 10C สูงเกินจริง: ตัวจัดเกรดนับรอบ error/ปุ่มที่ไม่มีเป็นผ่าน และบัค engine ผ่านเพราะ model คัดลอกตัวเลขถูก
- [x] **เป้าเดือนที่ข้อมูลยังไม่ครบ ต่ำไป ~27%** (`159a02e`): เป้าเดือนหารด้วยวันที่มีข้อมูล (ก.ย. 22) แทนวันในปฏิทิน (30) → ยอดเทียบเป้า 73% ที่จริง ~100% · `daysInMonthIndex` = วันในปฏิทิน · test ตกบนโค้ดเก่า
- [x] **Dashboard ซ้ำ** (`43e801e`): 10/12 คนมีการ์ดสองใบบน metric เดียว หัวตัวเลขเดียวกัน (CFO 70.3 ล้านบาท ×2, CEO ความผิดปกติ ×2) → ปักได้ metric ละใบ + การ์ดความผิดปกติใบเดียว (`lib/dashboard/one-per-metric.ts`): ปัก/รับข้อเสนอ/ปักจากแชต ย้ายใบเดิมไปถาดและบอก · layout เดิมจัดครั้งเดียวตอนอ่าน · template ผอ.ขาย/HR ไม่ซ้ำ · ข้อเสนอบน metric ที่ปักอยู่บอกว่า "ปักแล้วจะแทน …"
- [x] **ช่วงเวลาซื่อตรง** (`a7d1940`): ป้ายบอกวันที่ข้อมูลครอบคลุมจริง · ช่วงสั้นกว่า 4 สัปดาห์เทียบวันเดียวกันของสัปดาห์ก่อน (ขายออกสัปดาห์นี้ −33% → −2.7%) · ยอดรวมรายเดือนที่จบในเดือนไม่ครบเทียบตามสัดส่วนวันและบอก (AR −37.1% → −14.3%) · prompt ผูก "วันนี้/สัปดาห์นี้" กับวันสุดท้ายของข้อมูล · การ์ดที่ปักเลื่อนตามเวลา (`lib/dashboard/rolling.ts`)
- [x] **IT เปิดสิทธิ์ให้ตัวเองได้** (`538f39f`): ห้ามขยายสิทธิ์บทบาทตัวเองเกินค่าตั้งต้นทุกทาง (แชต + หน้าแอดมิน ปุ่มปิดพร้อมเหตุผล) · prompt ไม่ชวนเปิดสิทธิ์ให้ตัวเอง · ซ่อนกลุ่มเล็กไม่ใช่ "ปิดตามสิทธิ์"
- [x] แก้คำอ้างของฉันเอง: "ปักการ์ดที่ไม่ใช่ metric 2/12" ผิด — ทั้งสองคือการ์ด `alert_list` จริง (ถูกต้อง)
- [ ] ยังไม่แก้ (พฤติกรรม model): ชื่อ/คำบรรยายการ์ดขัดกับแถว (ไม่มีตัวตรวจ title/description), เหตุผลที่ไม่มีใครให้, ปีแคมเปญผิด, ตอบเกณฑ์จากค่าเฉลี่ยทั้งประเทศทั้งที่มี alert ระดับ DC, "ไม่มีข้อมูล" แทน "ไม่มีสิทธิ์" (`list_metrics` ซ่อน metric none), ปุ่ม "แยกตามภาค" ให้คนเห็นภาคเดียว, การ์ดวาดเองที่ไม่ใช่ metric แต่งข้อมูล (ตารางความสด, เจ้าของ CRM), สิทธิ์รายคนถูกขยายเป็นทั้งบทบาท
- [ ] ตัวจัดเกรด `sim-report.ts`: นับรอบ error/ปุ่มไม่พบ/approval ที่ปฏิเสธให้ถูก, ป้ายที่ยังคาด handoff ทั้งที่ปิด

## 7. Prompt rules (used by 1B, referenced by 3B)

Persona rules the handler passes as `rules` (Thai unless noted):

- ตอบเป็นภาษาไทย กระชับ 1–3 ประโยค แล้วให้ UI แสดงข้อมูล ห้ามพิมพ์ตัวเลขซ้ำใน markdown
- ทุกตัวเลขต้องมาจากผลลัพธ์ tool ในบทสนทนานี้ ถ้าไม่มีข้อมูล ให้บอกว่าไม่มี ห้ามประมาณเอง
- ก่อนเรียก `query_metric` ให้ยืนยันนิยามในใจ: ถ้าคำถามกำกวมระหว่าง metric (เช่น "ยอดขาย" = ปริมาณหรือมูลค่า) ให้เลือก certified metric ที่ตรงที่สุดและบอกผู้ใช้ในประโยคเดียวว่าใช้ตัวไหน
- ใต้ทุก Card ที่มีข้อมูล ใส่ Text muted หนึ่งบรรทัด: `แหล่งข้อมูล: <sourceSystem> · <certified ? "รับรองแล้ว" : "คำนวณ"> · ณ <asOf>` (copy from provenance)
- ผลลัพธ์ที่มี `masked` ให้บอกว่า "มี N ฟิลด์ถูกปิดตามสิทธิ์" และเสนอปุ่ม ขอสิทธิ์ (runTool `send_email` ถึงเจ้าของ metric) ห้ามเดาค่าที่ถูกปิด
- `PERMISSION_DENIED` = ตอบว่าข้อมูลนี้อยู่นอกขอบเขตของผู้ใช้ และเสนอส่งเรื่องให้ผู้รับผิดชอบผ่าน `resolve_owner`
- เมื่อพบความผิดปกติ (จาก `get_alerts` หรือจากตัวเลข) ให้เสนอสมมติฐาน 1 ข้อ + วิธีตรวจ 2 ทาง + ถามว่าจะส่งต่อให้ผู้รับผิดชอบไหม (ปุ่ม runTool `create_handoff`)
- ชื่อคนในข้อความตอบมาจากผล tool หรือข้อความของผู้ใช้เท่านั้น; ปุ่มที่กด (`⟦action⟧ runTool`) มีแค่ user id ห้ามเดาชื่อจาก id (Gemini เคยเขียน "คุณวีระศักดิ์" แทน "คุณวีร์")
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
| 7 | 7A tool contract | opus | security boundary: every permission path reads the surface | Behaviour-preserving refactor; `surface.test.ts` first, then move tools one per file |
| 7 | 7B ports + async | opus | wide async ripple, scope reads the directory | Engines stay pure; grep test forbids entity imports outside adapters |
| 7 | 7C connector registry | opus | scope inject/filter, masking, per-user auth | Reads Vexa `core/mcp.ts` for the client and fence; does not use handler `mcp` |
| 7 | 7D admin | sonnet | UI grouping over an existing matrix | Surface arrives as props; no registry import in client |
| 7 | 7E demo + red-team | opus | adversarial tests | Stub adapter in tests; demo server only for the browser check |

Model choice rule: opus for anything that guards data (access, red-team), needs numeric/statistical correctness, or is user-facing UI (the user wants opus on UI); sonnet for non-UI workflow/glue packages; haiku for mechanical sweeps (copy, formatting, curl checks, README). Never default to one model for everything.

Ownership rule for parallel agents: a package edits only the folders listed in its heading plus new files; shared files are append-only; no package changes `lib/contracts/*` (a needed change is proposed in its report and applied by the orchestrator between phases).

## 9. Changes to Vexa (agentic-ui) made for Cop

Vexa is not a constraint (user decision 2026-09-22): change it when Cop needs it, prefer general features, list them here. Candidates already identified: a pluggable catalog (`createVexaHandler({ catalog })` + `SpecView registry`) so Cop can add `Provenance`, `AnomalyCard`, `HandoffCard`, `Sparkline`, `Heatmap`; `VexaChat` `initialMessages`/`id`; a headless `useVexaChat` so Cop can own the chat chrome.

- [x] `openMcpClient(transport, clientName)` exported from `vexa/server` with the `MCPClient` type (phase 7C) — a host that owns permission opens its own clients (Cop: one per user with that user's headers) and calls tools itself, using Vexa's transport handling (stdio stays a dynamic import) and `fence`, without the handler's static `mcp` option; `connectMcp` now opens through it. The per-user pool stays in Cop (`lib/server/connectors/pool.ts`); `wrapMcpTool` was not needed.
- [x] `ListItem` (phase 6F, uncommitted on `roadmap`) — one row of a list of people, places or things (avatar or thumb, title, subtitle, detail, badges, trailing value); with `on.press` the whole row is the press target, so a model does not stack Avatar + Text + Badge + a Button under every row. Gallery section `list-item`, prompt rule, registry passes `on("press").bound`. `trailingTone` (good/bad/neutral) colors the trailing value, and the title row wraps so a long trailing value drops below a title instead of truncating it (6G).
- [x] `Carousel` slides from children + `useVexaLabels` (phase 6E, uncommitted on `roadmap`) — any catalog tile (Cop's `CandidateTile`, `CourseTile`) can be swiped, not only the fixed item shape; the hint and arrow labels come from `ChatLabels.carouselHint/Previous/Next` so a host's locale reaches them (was hard-coded "Swipe or drag to scroll freely").
- [x] `Image.aspect` `banner` (21:9) (phase 6, uncommitted on `roadmap`) — a photo can head a card without pushing its numbers below the fold; `wide` 16:9 at chat width took ~360 px before the first number.
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
- [x] A spec binds only to tool results up to its own message (2026-09-23, user reported an old card redrawn after a new question): `AssistantMessage` passed the whole chat to every `SpecView`, so `/tools/query_metric` in an earlier reply resolved to the latest call in the chat and every past DataCard redrew with the newest result. Now `AssistantMessage` passes `messages` through its own message, and `/tools/<name>.N` counts the calls within one turn (what Cop's catalog already told the model). Test: `src/chat/spec-tool-scope.test.tsx`.
- [x] `streamAgentChat` ส่ง `onError` ให้ stream (2026-09-25, `src/core/chat.ts`): log error จริงฝั่ง server ทุกครั้ง, development ส่งข้อความจริงให้ client, production ยัง "An error occurred." — เพื่อหาสาเหตุ error ของ Gemini ขั้นที่สองที่เกิดเป็นครั้งคราว (ยังไม่ commit ใน agentic-ui) · error ที่ไม่ใช่ `Error` (provider โยน object มา) เดิมกลายเป็น "[object Object]" ทั้งใน log และข้อความ → ตอนนี้ JSON ≤ 600 ตัวอักษร (พบจาก Phase 10: คุณธนา session 7 ขั้นที่สองหลัง `list_metrics`)
- [x] Card-walk fixes (2026-09-26, `sim/runs/2026-09-25/card-walk.md` ข้อ 9; ยังไม่ commit ใน agentic-ui):
  - `detachedSpecParts` (`src/chat/spec-continuation.ts`): json-render `buildSpecFromParts` เขียนแถวลงใน array ที่ patch `add` ส่งมา การ rebuild จาก part เดิมจึงซ้อนแถวทุกครั้ง (ตาราง 21 metric แสดง 84 แถว) — `AssistantMessage` ส่ง copy ของ part ให้ `useJsonRenderMessage` แทน
  - `normalizeSpec` ได้ `turnToolOutputs` (ผล tool ตั้งแต่ผู้ใช้พูดครั้งล่าสุด) เพิ่มจาก `toolOutputs` — Cop ใช้เติมบรรทัด scope ของการ์ดวาดเองเฉพาะจาก metric ของรอบนั้น เดิมการ์ดนโยบายได้ช่วงเวลาของการ์ดงบจากรอบก่อน
  - reasoning ที่ค้าง state `streaming` ในข้อความที่จบแล้วไม่ขึ้น "กำลังคิด" อีก และคำตอบที่ไม่มีข้อความ/spec/approval แสดง `labels.unanswered` (รอบ 429/504 เดิมค้างว่างหรือโชว์ reasoning)

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
| A connector exposes data outside the asker's scope | tools on one surface through `toolsFor`; `scope` required per tool (inject + filter in Cop); red-team 7E; connector switch |
| An MCP server changes its tools or schemas | Cop's config pins each tool and its zod input; startup diff logs drift; unknown tools never exposed |
