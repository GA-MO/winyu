# mascop plan

mascop is Winyu rebuilt on Mastra (the agent) and CopilotKit (the chat UI, over AG-UI). It serves the same 26 users, the same generated Boon Rawd data, the same tools, permissions, gateway and audit. The UI may look different. Done means every Winyu feature in the parity matrix below works in mascop, verified in the browser for every role it touches. Extra features are welcome.

mascop is a separate project. It has no dependency on Winyu (`../Cop`) or Vexa (`../agentic-ui`): no path alias, no import, no script that reads them. Code that mascop needs is copied in once and owned here.

## How to read this

One box is one unit of work. Check a box only when its evidence exists: a test run, a curl output, a screenshot, or a commit SHA. Each phase ends with `bun run typecheck`, `bun test`, and a check on the real surface it changed. Tests alone do not verify a phase.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Copy Winyu's domain (`lib/data`, `lib/semantic`, `lib/access`, `lib/engine`, `lib/server`, `lib/harness`, `lib/cards/present.ts`, `lib/i18n`) with identical paths, so `@/lib/...` imports resolve unchanged | Same data and users by construction; the copy compiles without edits except at the Vexa seams |
| D2 | Tool definitions become engine-neutral: `WinyuTool = { entry, capability, description, inputSchema, execute }`, `execute = gated(capability, fn)` | The harness gateway (policy, CEL rules, budget, verify, recovery, audit) stays the one choke point; Mastra and the background AI SDK jobs each adapt the same object |
| D3 | Mastra owns the chat loop: one agent whose instructions and tools are functions of the request context (the signed-in user) | Per-role tool sets and persona prompts, as in Winyu, without memoizing an agent per role |
| D4 | CopilotKit draws every tool result with a React renderer keyed by tool name. The model chooses the tool; mascop draws the card from the tool result | Keeps Winyu's rule that the model never types a number into a card. Replaces json-render specs, which mascop does not use |
| D5 | Write and destructive tools pause for approval (Mastra tool approval, surfaced by CopilotKit human-in-the-loop). `asksApproval` from the gateway decides | Same rule as Winyu: approval only for a call the policy would let through |
| D6 | One real model, `google/gemini-3.8-flash` through OpenRouter | Same as Winyu, so the two stacks compare on equal terms |
| D7 | Presentational primitives (Card, Metric, charts, RankList, Table, Alert) are copied from Vexa into `components/ui/` | Fastest route to complete cards; the look may then diverge freely |
| D8 | Mastra memory (LibSQL storage at `.data/mastra.db`) holds the chat messages; `.data/threads.json` keeps thread metadata (title, dates, rename, delete). Memory extraction reads the finished turn from the run (question and recorded queries) | The AG-UI bridge diffs against Mastra memory and tool approval needs Mastra storage anyway; one message store, not two |
| D9 | The Mastra agent is built once; a fresh `MastraAgent` bridge is built per request with `resourceId = userId` and a `RequestContext` carrying the user | The bridge writes request state into itself, so a shared bridge leaks between users |

## Stack facts (probed 2026-10-05, `/private/tmp/claude-501/mastra-probe`)

| Piece | Version and use |
|---|---|
| `@mastra/core` 1.74.0, `@mastra/memory` 1.35.0, `@mastra/libsql` 1.25.0 | Agent with `instructions` and `tools` as functions of `{ requestContext }` (annotate tools `ToolsInput`); `createTool({ requireApproval: (input, ctx) => boolean })`; `stopWhen: stepCountIs(6)` |
| `@ag-ui/mastra` 1.1.6, `@ag-ui/client` 1.0.1 | `new MastraAgent({ agentId, agent, resourceId, requestContext })`; approval arrives as `RUN_FINISHED.outcome.interrupts` with reason `mastra:tool_approval`, resumed with `{ approved }` |
| `@copilotkit/runtime` 1.77.0 (`/v2`) | `new CopilotRuntime({ agents: async ({ request }) => ... })`, `createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" })` at `app/api/copilotkit/[[...slug]]/route.ts` |
| `@copilotkit/react-core` 1.77.0 (`/v2`) | `CopilotKit`, `CopilotChat`, `useRenderTool({ name, render })`, `useInterrupt({ render })`, headless `useAgent`. `@copilotkit/react-ui` is the deprecated v1; not used. Thread drawers need the paid Intelligence tier; mascop builds its own rail |
| Model | `openrouter/google/gemini-3.8-flash` model-router string works. `@openrouter/ai-sdk-provider` 3.x needs `ai@7` and conflicts with CopilotKit's `ai@6`; keep provider 2.x if an AI SDK model instance is needed for metering |
| Telemetry | `COPILOTKIT_TELEMETRY_DISABLED=true` |

## Parity matrix

Each row is one Winyu feature. The phase column says where mascop builds it. The check column is the evidence that closes it.

| # | Feature | Phase | Check |
|---|---|---|---|
| F1 | Persona login (role, then person), session cookie, redirect to `/login` | M3 | Every role signs in; `/` without a cookie redirects. Done (M3): IT admin signs in to `/admin` and `/dashboard` sends IT there, as in Winyu; walk `.shots/m3-walk.ts` PASS lines, `m3-landing-itadmin.png` |
| F2 | Access: role policy, region/brand scope, metric ACL masking, tool allow-list, kill switches, role overrides | M0 | Copied tests pass; health route shows different tools and rows for CEO and a sales rep |
| F3 | Chat agent: persona context, memory ranked by the question, 6 model steps with wrap-up, tool budget, fix hints | M1 | Probe question per role; trace shows context items, steps, gateway decisions |
| F4 | Read tools drawn as cards: `query_metric` (DataCard views from `present.ts`), alerts, forecast, gap, calendar, people, person, site, candidates, courses, policy, entity, owner, memory, metrics list, connector tools | M2 | One question per tool in the browser; card numbers match the tool result |
| F5 | Next actions on cards (rules from `next-actions.ts`) run the follow-up | M2 | Pressing a button starts the next tool call |
| F6 | Write tools with approval: `request_leave`, `enroll_course`, `create_handoff`, `send_email`, `pin_widget`, `watch_metric`, `run_job`, `set_permission`; approval card; post-condition verify | M2 | Approve and reject each in the browser; audit row and record exist after approve, none after reject |
| F7 | Threads: new, list rail grouped by date, restore, rename, delete, search | M2 | Reload a thread and see the same cards |
| F8 | Memory: extraction after a turn, memory page (list, delete), review | M2, M3 | A stated preference appears on `/memory`; delete removes it. M3 part done: `/memory` lists learning and known facts, delete removes one (6 → 5 after reload), `m3-memory-ceo.png` |
| F9 | Landing: greeting, morning brief, quick actions learned from use, ambient cards, stories, feed, visits | M3 | Same landing for every role, content scoped per role. Done (M3): CEO and u_krit (northeast: 3.9 ล้านลิตร, 93.3%) `m3-landing-ceo.png`, `m3-landing-krit.png`, `m3-stories-evidence-ceo.png`, `m3-landing-ceo-phone.png`, `m3-landing-ceo-dark.png` |
| F10 | Dashboard: pinned widgets, suggested tray with reasons, pin and unpin, layout versions, seen tracker | M3 | Pin from chat shows on `/dashboard`. Done (M3) for the page: pin a suggestion and unpin both survive reload (4 → 5 → 4), `m3-dashboard-ceo.png`, `m3-dashboard-pinned-ceo.png`; pin from chat waits on M2 |
| F11 | Inbox and notifications: handoffs (accept, need info, return, open in my agent), alert actions (hypothesis, verify, dismiss), replies, bell | M3 | Handoff from one role arrives in another role's inbox. Done (M3): CEO → u_krit packets accepted, need info, returned in the drawer; CEO bell shows 3 unread and the replies tab; mute and dismiss; `m3-inbox-*.png` |
| F12 | Personal watches: create from chat, list, delete | M3 | `watch_metric` result appears in watches. Done (M3) for list and delete: a watch made through `createWatch` shows in the account sheet and its delete removes it, `m3-account-ceo.png`; create from chat waits on M2 |
| F13 | Engine jobs: anomaly, forecast, digest, scheduler, `POST /api/jobs/run`, morning investigation | M4 | Job run writes alerts and an investigation run with its trace |
| F14 | Outbox page | M3 | `send_email` approved shows in `/outbox`. Done (M3): three handoff mails on `/outbox`, `m3-outbox-ceo.png`; `send_email` from chat waits on M2 |
| F15 | Admin console (IT only): overview, access matrix, tool kill switch, audit with run trace, usage and spend, view-as-role simulator, CEL deny rules with dry run, connectors | M4 | Each tab renders; a deny rule refuses a call in chat |
| F16 | Connectors (MCP and REST) with per-user scope: `crm_demo`, `lms_demo` | M4 | Connector tool answers in chat, scoped per user |
| F17 | Audit: redact, initiator, run link; `bun run trace` | M1 | Audit row per tool call; trace script prints the latest run |
| F18 | Account sheet: memory link, theme, persona switch, admin link for IT | M3 | Switch persona without logging out. Done (M3): sheet has watches, memory preview, outbox link, theme, persona switch, admin link for IT, `m3-account-ceo.png` |
| F19 | HR flows: leave form, course enrolment, candidates | M2 | Leave request approved appears in HR records |
| F20 | Thai UI strings in `lib/i18n/th.ts` | M0 | Copied as is |
| F21 | Usage meter and model ledger (tokens, cost) | M1 | Admin usage tab shows the probe's cost |

## Phases

### M0. Standalone domain

- [x] Scaffold Next 16, React 19, bun, TypeScript strict, `@/*` alias only, happy-dom test preload.
- [x] Copy the 213-file domain closure with its tests, `scripts/seed.ts`, `public/img`.
- [x] Remove every Vexa touchpoint: local `fence`, `prefixedToolName`, MCP client from `@ai-sdk/mcp`, local `PersonaContext`, no json-render `Spec` types, neutral `WinyuTool`, `models.ts` without the scripted mock, `traceMiddleware` in `lib/harness/trace.ts`.
- [x] `app/api/health` runs `query_metric` through the gateway for a given user, under `next dev`.
- [x] Evidence: typecheck passes; `bun test` 529 pass, 0 fail across 52 files (464 `test()` declarations, the same static count as the same files in Winyu); the grep matches only prose in `docs/` and `CLAUDE.md`; `/api/health?user=u_thana` (ceo) returns 23 tools and 1,110.2 ล้านบาท over 6 regions, `?user=u_krit` (sales_rep, northeast) returns 21 tools and 232.5 ล้านบาท over 1 region. Commits 08f7b25..b8607eb.

### M1. Agent on Mastra

- [x] Mastra agent with dynamic instructions (`personaFor`) and dynamic tools (`toolsFor(access)` mapped to Mastra tools around `WinyuTool.execute`), OpenRouter Gemini, 6 steps, wrap-up on the last step. `lib/harness/adapters/mastra/agent.ts`: the model is the AI SDK instance from `agentModel()` (trace and usage-meter middleware keep working), `defaultOptions: { maxSteps: 6, prepareStep: wrapUpAtLimit }`.
- [x] Request context carries the user id; tool execute runs inside `runWithAccess`, `runWithTurn`, `runWithRun` (the ALS survives into Mastra's tools), so audit rows carry `initiator: person` and the run id. The AG-UI `runId` is the harness run id and Mastra's run id.
- [x] Approval for write and destructive tools decided by `asksApproval`. An approval splits a question into two runs sharing the goal id `<threadId>:<messageId>`; the interrupt id is recorded in the approval ledger for the person asked and spent by the resume that answers it, so a replayed or forged answer gets 409.
- [x] CopilotKit runtime route serving the agent over AG-UI (`app/api/copilotkit/[[...slug]]/route.ts` → `serveCopilot`); 401 without the session cookie, 404 on another person's thread.
- [x] `WINYU_RULES` rewritten for tool renderers: no json-render rules, the domain rules kept.
- [x] Threads and memory: a run on a new thread id creates its `.data/threads.json` record (first question as title). After a finished turn (no pending approval) `finishTurn` logs the question with the slice it queried and runs memory extraction. Turns come from the run (its question and the `query_metric` queries the turn recorded), not from Mastra memory: the run already holds both, and reading memory back would cost a storage round trip for the same facts. D8's "reads turns from Mastra memory" is replaced by this.
- [x] Evidence: `bun run probe:chat` (POST `/api/copilotkit/agent/mascop/run` with a session cookie) passes four scenarios: CEO query with audit row and saved trace; sales rep scoped to northeast; pin approved (widget in layout, replayed answer refused); pin declined (nothing written). 11 model calls, $0.044 for the whole probe. `bun run trace` prints the run with steps and gateway decisions. Typecheck passes; `bun test` 540 pass, 0 fail across 55 files. Commits 3363c48..a67753d.

### U. UI foundation (parallel with M1)

- [x] Copy Vexa's presentational primitives into `components/ui/`; port the card components with a local action callback in place of Vexa's host `runTool`. `CardActionsProvider` takes `runAction(CardAction)` (a `NextAction`, an `ask` row press, or a `form` write call); `actionRequest` turns it into a tool call or a question; `TOOL_CARDS` in `components/cards/registry.tsx` draws every read tool; `renderApproval` draws every write tool.
- [x] Login page, session API, app chrome, account sheet, theme.
- [x] `/dev/cards` renders every card kind from real tool results for review.
- [x] Evidence: typecheck passes; `bun test` 548 pass, 0 fail across 56 files (includes the DataCard grounding test and the registry coverage test); headless Chrome walk on :3201 (login → CEO home → persona switch to u_krit → `/dev/cards` light and dark for both, 30 cards each, no broken images); screenshots `.shots/u-*.png` (gitignored). Commits 462331b..HEAD on `u-ui-foundation`.

### M2. Chat

- [ ] CopilotKit chat at `/c/[threadId]` with a renderer for every tool (F4), next-action buttons (F5), approval cards (F6).
- [ ] Threads persisted and restored, thread rail (F7); memory extraction after each turn (F8).
- [ ] Evidence: browser walk of one question per tool and every write tool, screenshots per role.

### M3. Pages

- [x] Copy the domain-only API routes (alerts, dashboard layout and widgets, feed, inbox, memory, notifications, quick actions, watches); build landing, dashboard, inbox drawer and bell, stories drawer, memory, outbox, account sheet (F1, F8 to F12, F14, F18). Widgets draw `WidgetView.card` through `CardPartsView`; stories draw evidence through `DataCard`. Everything that starts a chat links to `/c/new?prompt|preload|story` (`components/landing/chat-entry.ts`, tested); card buttons outside the chat go through `ChatLinkActions`.
- [x] Evidence: typecheck passes; `bun test` 563 pass, 0 fail across 61 files on a fresh seed (`lib/server/team-feed.test.ts` reads `.data`, so it fails after a walk has dismissed alerts; reseed first). Headless Chrome walk `.shots/m3-walk.ts` after `bun run seed`, `.shots/m3-setup.ts` (three CEO → u_krit packets, a watch, memory facts through the domain modules) and Winyu's saved `investigations.json` copied into `.data` (no model calls; without it the landing shows the not-yet line, `m3-landing-ceo-no-brief.png`): 19 PASS, 0 FAIL, the only 4xx are `/c/new` (M2) and `/admin` (M4). Screenshots `.shots/m3-*.png` (gitignored). Commits 8ed9920..HEAD on `m3-pages`.

### M4. Admin, jobs, connectors

- [x] Admin console with every tab, run trace view (F15, F17, F21). `/admin` for `it_admin` only (any other role gets a 404, no session redirects to `/login`): overview, access matrix, tools with kill switches, CEL deny rules with dry run, audit with "AI ทำอะไรในคำถามนี้" run trace, usage and spend, view-as-role simulator; connector health on overview, access and tools. The run trace header shows that run's model calls, tokens and cost (`runSpend` in `lib/server/model-ledger.ts`, keyed by run id). Unanswered questions come from the question events `finishTurn` logs, since threads no longer hold messages. A job's model calls are `background` spend kept on the job's run (`lib/server/usage-meter.ts`; test "a job's measured calls are background spend kept on the job's run", which fails without the fix).
- [x] Scheduler, jobs route, morning investigation (F13); connectors with demo servers (F16). `instrumentation.ts` reconciles connectors and starts the scheduler (`MASCOP_SCHEDULER=off` skips it; `INVESTIGATE_DAILY=1` adds the morning investigation). `POST /api/jobs/run` (IT only, 403 otherwise) runs `all`, `anomaly`, `forecast`, `watches`, `digest`, `tick`, and `{ job: "investigate", user }` for one person. `bun run connectors:demo` serves the LMS (MCP, :3299) and CRM (REST, :3298); `bun run call-tool <user> <tool> [json]` runs one tool through the gateway and prints the audit decision.
- [x] Evidence: IT admin walk over CDP on :3204 (`.shots/m4-tab-*.png`, `m4-kill-switch.png`, `m4-rule-dry-run.png`, `m4-audit-deny-trace.png`, `m4-investigation-trace.png`, `m4-audit-connector-crm.png`, `m4-usage.png`, `m4-overview-after.png`, `m4-ceo-404.png`). Kill switch: `get_forecast` gone from `/api/health?user=u_thana` after the flip, back after the revive. Rule `tool.name == "send_email" && user.role.startsWith("sales_")`: dry run 1 of 16 rows, then `call-tool u_anucha send_email` denied `POLICY_RULE`, and one chat run as u_anucha called `send_email`, was refused by the rule without an approval, and answered with the rule's name (3 model calls, $0.0116; trace and cost on the audit row). Jobs: `anomaly` rewrote 46 alerts from an empty file, identical to the seed; `investigate` for u_prasit saved 3 stories after 20 tool calls (7 model calls, $0.0617), traced on the audit tab. Connectors: `crm_demo__store_visits` gives the CEO 120 rows across regions and u_krit 24 northeast rows with order value masked; `lms_demo__training_history` gives u_krit his own 2 rows, u_anucha himself and u_krit, the CEO none in scope. Typecheck passes; `bun test` 568 pass, 0 fail across 62 files. Commits 6fd9bc8..HEAD on `m4-admin`.

### M5. Parity walk

- [ ] Walk every role through its features in the browser; tick each matrix row with its screenshot path.
- [ ] Write `docs/comparison.md`: what Mastra and CopilotKit gave for free, what had to be rebuilt, what is worse or better than Winyu, cost per question measured on the same probe questions.

## Order and parallel work

M0, then M1, in sequence: every later phase builds on the neutral tools and the agent route. After M1, M2 (chat), M3 (pages) and M4 (admin, jobs) touch disjoint directories and run in parallel worktrees. The `components/ui/` copy lands first inside M2 and M3 and M4 rebase onto it. M5 runs last.

## Risks

- Mastra, CopilotKit and AG-UI versions may not agree with Next 16, React 19 and zod 4. M1 proves the stack before any UI work.
- Mastra changes tool approval often (1.72 changed it). Pin exact versions.
- Winyu's registry, enforce and connectors import cycle shows only under `next dev`. M0's health route checks it.
- Memory extraction reads AI SDK UI message parts. M2 converts AG-UI messages to that shape before `saveMessages`.
