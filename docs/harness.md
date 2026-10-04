# Winyu harness

The harness is Winyu's control plane around the agent: it owns the run, the policy decision on every tool call, what was observed, whether the result is trusted, and what happens on failure. Vexa stays the agent and UI engine; the domain layer (`lib/semantic`, `lib/engine`, `lib/server/*` business modules) stays where it is.

```
Browser (Vexa chat) ──POST /api/chat──▶ harness runtime ──▶ Vexa adapter ──▶ createVexaHandler ──▶ model
                                          │ run, goal, context, events          │ tool call
                                          ▼                                     ▼
                                    run trace (.data/runs.json)          harness gateway ──▶ policy ──▶ domain tool
                                                                                 │ observation ─▶ verification ─▶ recovery
                                                                                 ▼
                                                                          audit (.data/audit.json)
```

## The map before this change (2026-10-04)

| Concern | Where it lived | Gap |
|---|---|---|
| Request entry | `app/api/chat/route.ts`: cookie → `AccessContext`, `runWithAccess` + `runWithTurn` (AsyncLocalStorage), then the handler | No run object; a turn id only reached the audit |
| Engine | `lib/server/agent/handler.ts`: `createVexaHandler` memoized per role and tool set, `stepCountIs(6)` | No `toolApprovalSecret`: a client could send a transcript with a forged, approved tool call |
| Context | `lib/server/agent/persona.ts`: a list of prompt lines (role, scope, memory top 12 by confidence, packet, story) | No source, priority or budget per item; memory not ranked by the question; the transcript grows without a window |
| Tool surface | `lib/server/tools/registry.ts` + `define.ts` (native), `lib/server/connectors/define.ts` (MCP, REST) | — |
| Tool permission | `lib/access/enforce.ts` `toolsFor` filters the tool set before the handler; connectors re-check at call time in `connectors/call.ts` | Native tools never re-check at call time: `winyuTools()[name].execute` runs any tool for any role (used by `investigate.ts`, scripts, tests) |
| Scope on data | `runMetric` (`lib/server/metrics.ts`), connector `scopedArgs`/`scopedRows` | Nothing checks a result after the fact |
| Approval | AI SDK `needsApproval` on every non-read tool, card in `components/cards/approval-card.tsx` | Unsigned |
| UI action → tool | A button sends `⟦action⟧ runTool <name> {json}`; Vexa's `sanitizeActionMessages` drops unknown names; the model then calls the tool | Lands in the same `execute`, so it inherits whatever that point enforces |
| Audit | `withAudit` around each execute: one `AuditEntry` per call | Covers tool calls only, not the run, policy, approval, verification or completion |
| Failure | A tool returns `{ ok: false, code }` or throws; the model sees it | No classification, no retry, no cap on tool calls per run |

Every model tool call, a pressed button and an approved write all end at the AI SDK `execute` of one tool. That is the single choke point the gateway takes over.

REST routes under `app/api/*` (dashboard layout, memory edit, watches, inbox replies) change the caller's own records directly, keyed by `access.userId`. They are not agent tools and stay outside the gateway.

## What each phase changed

| Phase | Result |
|---|---|
| 0 Baseline | `typecheck` pass, `test` 723 pass / 0 fail, `build` pass |
| 1 Interfaces | `lib/harness/types.ts`, `events.ts`, `state.ts` |
| 2 Gateway | `gateway.ts` + `policy.ts` replace `withAudit`; native and connector tools authorize at call time |
| 3 Runtime | `runtime.ts`: run id = turn id, step id per model call, tool call id from the SDK, events folded into `AgentState`, trace saved per run |
| 4 Observation, verification, recovery | `observation.ts`, `verification.ts` (row cap and scope post-check on reads), `recovery.ts` (retry table, limits) |
| 5 Context | `context.ts`: persona as `ContextItem`s with source, priority and scope under a budget; memory ranked by the question; transcript window |
| 6 Vexa adapter | `adapters/vexa/`: the only place that calls `createVexaHandler`, builds AI SDK tools, reads Vexa chat bodies and spec parts |
| 7 UI events | Pressed buttons and approval answers become `ui.action` / `approval.*` events; approvals are signed, bound to the person asked and spent on first use (`approvals.ts`) |
| 8 Writes | Post-conditions on every write tool (the record exists, belongs to the caller, says what was asked) |
| 9 Scenarios | `tests/harness-scenarios.test.ts`: one expected trace per scenario |

## Decisions that differ from the brief

- **Risk is the existing `ToolTier`** (`read` / `write` / `destructive`); no second field. Approval is derived from it (`read` → never, otherwise required) because a separate `approval` field would be a second source of truth that has to agree with the tier. No tool has an "optional" approval today.
- **No `sideEffects` list.** Nothing reads it. The write post-conditions in `verification.ts` say what a tool changes, and they are executable.
- **No new business write tools** (`update_target`, `delete_customer`). Phase 8 puts post-conditions on seven of the eight write and destructive tools Winyu already has; `run_job` is the eighth (below).
- **No transcript summarizer.** A summary needs a model call per turn and nothing measured shows long threads hurting answers. The window drops the oldest messages under a character budget and records what it dropped.
- **No `AgentEngine` abstraction beyond one type.** One implementation exists. The adapter is the only module that imports `vexa/server` for the agent; swapping engines means rewriting `adapters/vexa/`, not the domain.
- **No `verification.started` event.** Verification is synchronous and immediate; the event would always sit directly before `verification.passed` or `verification.failed` and carry nothing.
- **Scope post-check on `query_metric` only.** It resolves each row's region and brand through the dictionary. Other read tools (people, sites, connectors) keep their own scoping (`people-scope.ts`, connector `scopedRows`); a generic check would misread rows that legitimately name other regions.
- **`run_job` has no post-condition.** The jobs report counts, not records a check could look up; a check that only re-reads the output would be theater.

## Limits

| Bound | Value | When reached |
|---|---|---|
| Model calls per request | `LIMITS.maxSteps` = 6 (`stepCountIs`) | The last call gets no tools and is told to sum up what the tools returned, say what is missing and ask how to go on (`wrapUpAtLimit`, through Vexa's `prepareStep`); the trace records `agent.limited` |
| Tool calls per run | 12 for chat, 80 for the morning investigation | Further calls are refused with `RUN_LIMIT`, and the next model call is told to sum up the same way |
| Retries per tool call | 1, reads only | The failure goes back to the model |
| Fix hints per tool per run | `LIMITS.maxCorrections` = 2 | A refused call (or a read that failed its check) comes back with `fix`: the values that would work, from the capability's `correct` hook. After two, `fix` tells the model to stop and explain |
| Time per read tool | 20 s (a connector: its own timeout plus 20 s) | `TIMEOUT` |
| Time per request | 60 s (`maxDuration` of the chat route) | Next ends the request |
| Context | 12 000 characters of persona items, 120 000 of transcript | Lowest priority items, then oldest messages, are dropped and recorded |

## What the audit keeps

One row per tool call, written by the gateway from the observation. Each row carries `initiator` (`person` for a chat run, `job` for a background run such as the morning investigation, `system` for server code outside any run) and `turnId`, the id of the run it belongs to, so `/admin?tab=audit` opens a job's trace the same way it opens a question's and marks the row "งานอัตโนมัติ". A tool declares the arguments that are personal text with `redact` (`send_email` subject and body, `request_leave` reason, `create_handoff` ask); the audit keeps "(ซ่อนไว้)" in their place. The arguments hash still covers the full call.

Rows written before 2026-10-04 in `.data/audit.json` and in `sim/runs/*/records/audit.json` were not rewritten and may still hold such text.

## Correction

A tool that the model can call wrongly declares `correct` next to `verify`. When a call is refused (`rejected`) or a read fails its post-condition (`unverified`), the gateway asks the corrector for one instruction with the values that would work and returns it as `fix` beside the error; `recovery.decided` records the action `correct` and the text. Denials, throws and timeouts get no hint: the model cannot fix them. `query_metric`'s corrector (`lib/server/tools/correct.ts`) answers `BAD_QUERY` with the dimensions and comparisons the metric has.

Measured 2026-10-04 on the five chat questions in the audit that never recovered from `BAD_QUERY` (two runs each on Gemini 3.8 Flash, $0.24 in all): without the hint the model browsed `list_metrics` 19 times over 40 model calls and drew data in 2 of 10 runs; with it, 1 `list_metrics` call over 27 model calls and data in 5 of 10, at 19% lower cost. Where the metric truly cannot be split that way (gross margin by SKU or channel), it now says so in two model calls instead of four or five.

## Admin rules

An IT admin can add deny rules on `/admin?tab=rules`. A rule is a CEL expression (`@marcbachmann/cel-js`) over the facts of one tool call. When an enabled rule is true, the gateway refuses the call. `lib/access/policy-rules.ts` owns the rules (collection `policy-rules`), the validation and the evaluation.

A rule can read these facts:

| Variable | Holds |
|---|---|
| `tool` | `name`, `connector`, `tier` (`read` / `write` / `destructive`) |
| `args` | The tool input as the model sent it (`dyn`) |
| `user` | `id`, `role`, `regions`, `brands` from the caller's access context (`all` expands to every value) |
| `initiator` | `"person"`, `"job"` or `"system"` |
| `now` | `hour` (0 to 23) and `weekday` (0 = Sunday), Bangkok time |

`authorize` checks in this order: the code grant (role policy, overrides, kill switches), the rules, the run budget, approval. Rules are deny-only. There is no allow rule and no approval effect, so a rule can never let through a call the code grant refuses. Permission stays in code, and a mistyped rule can only take access away.

Rules run in stored order, and the first enabled rule that matches decides. A rule that throws or returns something other than `true` or `false` also refuses the call (fail closed), with a reason that says the rule could not be evaluated. A disabled rule is skipped. CEL's `&&` absorbs errors, so `tool.name == "send_email" && args.subject.contains("เงินเดือน")` never reads `args.subject` on another tool. Saving parses and type-checks the expression against the declared variables, so a syntax error, an unknown variable or a non-boolean result is refused with a Thai reason and the parser's message. Each expression is compiled once and cached by its text.

A refusal returns `POLICY_RULE` with the rule's name in Thai and no fix hint. The `tool.denied` event and the audit row carry `rule: { id, name }`, and the run trace shows a "กฎ: <name>" pill that links to the rules tab. The rules tab also shows a dry run: how many of the last 500 audit rows each rule would have refused. The dry run rebuilds facts from the audit, where personal text is hidden and long arguments are cut, so it can differ from what the gateway sees.

The engine asks for approval only on a call the policy would let through. `needsApproval` on a write tool runs `asksApproval` (`gateway.ts`), which is `authorize` on the same facts. A write that a rule, the code grant or the run budget refuses gets no approval card. It goes straight to the gateway and comes back as a refusal.

## How to read a run

In the app: `/admin?tab=audit` (IT only), open a question. The row shows "AI ทำอะไรในคำถามนี้": the question, the context items by kind (hover for source, priority and scope), each model step and what it asked for, and one line per tool call with the gateway's decision, the outcome, the checks, the recovery and the arguments. `/admin?tab=audit&run=<runId>` opens one question directly. `lib/harness/timeline.ts` folds the events into those lines; `components/admin/run-trace.tsx` draws them.

From a terminal:

```bash
bun run trace            # the latest run
bun run trace <runId>    # one run; the run id is also the audit's turnId
```

A chat request is one run. An approval splits a question into two runs that share one goal id (`<threadId>:<messageId>`): the first ends `awaiting_approval`, the second starts with `approval.granted` or `approval.denied`. The morning investigation (`lib/server/investigate.ts`) is a run of its own with intent `job:investigate`.

## Open

- Loading `lib/server/connectors/crm-demo.ts` as the first module of a fresh process crashes on an import cycle (registry ↔ enforce ↔ connectors). It exists at HEAD before this change; no real entry point loads it first. Next's bundler orders modules differently from Bun, so only booting `next dev` catches a new cycle of this kind: curl the dev server after touching tool or policy imports.
- Only reads time out (they are idempotent and retried once). A write runs to completion, bounded by the route's `maxDuration` of 60 s, so the model is never told a write failed while it lands.
- A write whose post-condition fails is reported to the model as not done, but its record stays; nothing rolls it back.
- The scope post-check reads row cells keyed by a dimension that has geography or brand behind it. It does not read the headline, summary or under-line text, dimensions with no region or brand (channel, pack, dates), or labels the dictionary cannot resolve. `runMetric` stays the enforcement; the check is a second line.
- A retried read runs its side effects twice (`query_metric` records the query twice; handoff evidence dedupes it).
- A run whose browser disconnects before the reply ends leaves no trace; the audit rows of its tool calls remain.
- The admin trace hangs off the audit, which lists questions that called a tool. A reply with no tool call, or one that stopped at an approval card nobody answered, has a trace in `.data/runs.json` but no row in the audit tab yet.
- The admin console's server actions (`app/(app)/admin/actions.ts`, IT only) change permissions directly, like the REST routes; they are not agent tools.
- `approval.granted` records what the browser sent. A forged answer still appears in the trace, followed by `agent.failed` when the SDK rejects its signature.
