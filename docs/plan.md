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

## Parity matrix

Each row is one Winyu feature. The phase column says where mascop builds it. The check column is the evidence that closes it.

| # | Feature | Phase | Check |
|---|---|---|---|
| F1 | Persona login (role, then person), session cookie, redirect to `/login` | M3 | Every role signs in; `/` without a cookie redirects |
| F2 | Access: role policy, region/brand scope, metric ACL masking, tool allow-list, kill switches, role overrides | M0 | Copied tests pass; health route shows different tools and rows for CEO and a sales rep |
| F3 | Chat agent: persona context, memory ranked by the question, 6 model steps with wrap-up, tool budget, fix hints | M1 | Probe question per role; trace shows context items, steps, gateway decisions |
| F4 | Read tools drawn as cards: `query_metric` (DataCard views from `present.ts`), alerts, forecast, gap, calendar, people, person, site, candidates, courses, policy, entity, owner, memory, metrics list, connector tools | M2 | One question per tool in the browser; card numbers match the tool result |
| F5 | Next actions on cards (rules from `next-actions.ts`) run the follow-up | M2 | Pressing a button starts the next tool call |
| F6 | Write tools with approval: `request_leave`, `enroll_course`, `create_handoff`, `send_email`, `pin_widget`, `watch_metric`, `run_job`, `set_permission`; approval card; post-condition verify | M2 | Approve and reject each in the browser; audit row and record exist after approve, none after reject |
| F7 | Threads: new, list rail grouped by date, restore, rename, delete, search | M2 | Reload a thread and see the same cards |
| F8 | Memory: extraction after a turn, memory page (list, delete), review | M2, M3 | A stated preference appears on `/memory`; delete removes it |
| F9 | Landing: greeting, morning brief, quick actions learned from use, ambient cards, stories, feed, visits | M3 | Same landing for every role, content scoped per role |
| F10 | Dashboard: pinned widgets, suggested tray with reasons, pin and unpin, layout versions, seen tracker | M3 | Pin from chat shows on `/dashboard` |
| F11 | Inbox and notifications: handoffs (accept, need info, return, open in my agent), alert actions (hypothesis, verify, dismiss), replies, bell | M3 | Handoff from one role arrives in another role's inbox |
| F12 | Personal watches: create from chat, list, delete | M3 | `watch_metric` result appears in watches |
| F13 | Engine jobs: anomaly, forecast, digest, scheduler, `POST /api/jobs/run`, morning investigation | M4 | Job run writes alerts and an investigation run with its trace |
| F14 | Outbox page | M3 | `send_email` approved shows in `/outbox` |
| F15 | Admin console (IT only): overview, access matrix, tool kill switch, audit with run trace, usage and spend, view-as-role simulator, CEL deny rules with dry run, connectors | M4 | Each tab renders; a deny rule refuses a call in chat |
| F16 | Connectors (MCP and REST) with per-user scope: `crm_demo`, `lms_demo` | M4 | Connector tool answers in chat, scoped per user |
| F17 | Audit: redact, initiator, run link; `bun run trace` | M1 | Audit row per tool call; trace script prints the latest run |
| F18 | Account sheet: memory link, theme, persona switch, admin link for IT | M3 | Switch persona without logging out |
| F19 | HR flows: leave form, course enrolment, candidates | M2 | Leave request approved appears in HR records |
| F20 | Thai UI strings in `lib/i18n/th.ts` | M0 | Copied as is |
| F21 | Usage meter and model ledger (tokens, cost) | M1 | Admin usage tab shows the probe's cost |

## Phases

### M0. Standalone domain

- [ ] Scaffold Next 16, React 19, bun, TypeScript strict, `@/*` alias only, happy-dom test preload.
- [ ] Copy the 213-file domain closure with its tests, `scripts/seed.ts`, `public/img`.
- [ ] Remove every Vexa touchpoint: local `fence`, `prefixedToolName`, MCP client from `@ai-sdk/mcp`, local `PersonaContext`, no json-render `Spec` types, neutral `WinyuTool`, `models.ts` without the scripted mock, `traceMiddleware` in `lib/harness/trace.ts`.
- [ ] `app/api/health` runs `query_metric` through the gateway for a given user, under `next dev`.
- [ ] Evidence: typecheck, test counts against the same files in Winyu, a grep for `vexa|agentic-ui|Cop` that prints nothing, curl of the health route for CEO and a sales rep.

### M1. Agent on Mastra

- [ ] Mastra agent with dynamic instructions (`personaFor`) and dynamic tools (`toolsFor(access)` mapped to Mastra tools around `WinyuTool.execute`), OpenRouter Gemini, 6 steps, wrap-up on the last step.
- [ ] Request context carries the access context; tool execute runs inside `runWithAccess`, `runWithTurn`, `runWithRun`, so audit rows carry `initiator: person` and the run id.
- [ ] Approval for write and destructive tools decided by `asksApproval`.
- [ ] CopilotKit runtime route serving the agent over AG-UI.
- [ ] `WINYU_RULES` rewritten for tool renderers: no json-render rules, the domain rules kept.
- [ ] Evidence: a probe script sends one question as CEO and one as a sales rep through the route, asserts a `query_metric` call, an audit row, and different scope; `bun run trace` prints the run.

### M2. Chat

- [ ] Copy Vexa's presentational primitives into `components/ui/`; port `DataCard`, `AlertsCard`, `ForecastCard`, card parts, chart bodies, approval card, leave form, signal list.
- [ ] CopilotKit chat at `/c/[threadId]` with a renderer for every tool (F4), next-action buttons (F5), approval cards (F6).
- [ ] Threads persisted and restored, thread rail (F7); memory extraction after each turn (F8).
- [ ] Evidence: browser walk of one question per tool and every write tool, screenshots per role.

### M3. Pages

- [ ] Copy the domain-only API routes; build login, landing, dashboard, inbox drawer, memory, outbox, account sheet, watches, notifications (F1, F8 to F12, F14, F18).
- [ ] Evidence: browser walk per role, screenshots.

### M4. Admin, jobs, connectors

- [ ] Admin console with every tab, run trace view (F15, F17, F21).
- [ ] Scheduler, jobs route, morning investigation (F13); connectors with demo servers (F16).
- [ ] Evidence: IT admin walk; a deny rule refuses a chat call; a job run writes alerts and an investigation trace.

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
