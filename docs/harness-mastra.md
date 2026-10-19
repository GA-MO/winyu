# Winyu's harness on Mastra

Winyu on Mastra copied the harness of Winyu (Vexa build, before 2026-10-05): the gateway, the run trace, the approvals ledger, the audit, a `setInterval` scheduler and the morning investigation. Phase F3 (2026-10-05) measured four Mastra harness features against that copy and adopted the ones that did better. This page records, for each one, what the copy did, what Mastra gives, the decision and the evidence.

| Need | Decision | Where |
|---|---|---|
| A chat run outlives a closed tab | Fixed in Winyu; CopilotKit's runner already kept the run going | `observeReply` in `lib/harness/adapters/mastra/turn.ts` |
| A chat run outlives a server restart | Adopted: Mastra durable agent, run checkpoints, recovery at boot | `durable.ts`, `recover.ts`, `instrumentation.ts` |
| Long work does not block | Adopted for the investigation as a Mastra workflow started in the background; tool-level background tasks rejected | `jobs.ts`, `app/api/jobs/run/route.ts` |
| Jobs on a timetable | Adopted: Mastra scheduled workflows; the copied scheduler is deleted | `jobs.ts` |
| An inbox event reaches an idle thread | Rejected: Winyu already writes handoff replies into the thread | `appendHandoffReply` in `history.ts` |
| A stalled model call does not hold the chat | Adopted: Mastra time budgets and a model fallback list; a calm slow state and ask-again in the chat | `agent.ts`, `durable.ts`, `models.ts`, `use-chat-session.ts` |
| Long threads do not resend every old result | Own input processor on Mastra's `processLLMRequest` stage; `ToolCallFilter` and `TokenLimiterProcessor` rejected | `history-trim.ts` |

## 1. Durable runs

**What the copy did.** A chat run was one HTTP request. CopilotKit's `InMemoryAgentRunner` starts the agent detached from the request, so the agent kept going when the browser left. Winyu's own end-of-run work was different: `observeReply` ended the harness run in the `flush` of a `TransformStream` on the response, and a client that leaves cancels the stream, so `flush` never ran. Measured with `bun run probe:durable --disconnect` on the old code: the reply was in Mastra memory and the `connect` replay, but the run trace was never saved (0 events). The same path also skipped `recordAsked`, so an approval asked in that run could not be answered later, the composed-card audit row, and memory extraction. A restart was worse: after `kill -9` mid-run, Mastra memory held 0 messages (not even the question), there was no trace, and one model call was billed for nothing.

**What Mastra gives.** `DurableAgent` runs the agent loop as a workflow, checkpoints the run state in storage (LibSQL works), streams through PubSub with a replay cache, and can re-drive a run from its last checkpoint with `recover(runId)`. Its automatic recovery (`recovery.durableAgents: 'auto'`) re-drives runs on its own, outside any request.

**Adopted.**
- `observeReply` reads its own `tee` of the reply, so the run, not the connection, decides when the reply is over. This is a Winyu fix and needs no Mastra feature.
- The chat agent is a `ChatDurableAgent` (`durable.ts`). It closes the stream when a run pauses for approval, which the AG-UI bridge needs, and keeps every snapshot, `running` included.
- Each chat run writes its trace to `.data/runs-inflight.json` when it starts and at every model step. `saveRun` clears the record.
- On boot, `recoverChatRuns` (`recover.ts`) sends each in-flight run Mastra still lists as active back through the normal serve path. The run keeps the person's access, the gateway, approvals, the card stream, learning and its tool budget. The trace gains an `agent.resumed` step (shown in the admin trace as "เซิร์ฟเวอร์เริ่มใหม่ระหว่างตอบ"). A run with no Mastra checkpoint is closed in its trace as interrupted.
- Mastra's automatic recovery is off on purpose. It would re-drive runs with no person, no gateway context and no harness run.

**Evidence.**
- Disconnect: `.shots/f3-disconnect.log`. The client cut at the first tool call. The trace has 14 events through `agent.completed`, memory holds the reply, and the connect replay sent 304 characters of text.
- Restart: `.shots/f3-restart.log`. The client cut, then `kill -9` on the dev server, then a restart. The saved trace runs started, context, step 1, `query_metric`, step 2, resumed, step 3 and completed. Memory holds the reply. The run cost 2 model calls ($0.0101).
- Screenshots: the thread after the restart (`.shots/f3-restart-thread.png`) and the admin trace with the resumed step (`.shots/f3-restart-trace.png`).
- Approvals through the durable agent: `.shots/f3-probe-chat-approval.log` (`probe:chat --only=c`). A pin was asked, approved and written once, a replay was refused with 409, and both runs share one goal.
- Tests: `turn.test.ts` covers a client that leaves after the first event; it fails on the old `TransformStream`. `runtime.test.ts` checks that checkpoints keep the budget. `recover.test.ts` checks that an orphan run is closed.

## 2. Background tasks

**What the copy did.** `runInvestigateJob` ran the morning investigation inside the scheduler tick or inside `POST /api/jobs/run`, which held the HTTP request until every person was done. Each person is a traced run with an 80-tool-call budget (`tracedRun` in `investigate.ts`).

**What Mastra gives.** Background tasks dispatch an agent's tool call without blocking the agent loop. The result lands in memory later, or in the same stream with `untilIdle`. Workflows can also start with `startAsync` and report their status from storage.

**Adopted.** The investigation is the `morning-investigation` workflow. It runs three people at a time (`foreach`). `POST /api/jobs/run {"job":"investigate","user":…}` returns `202 {runId}` at once, and `GET /api/jobs/run?run=<runId>` reports Mastra's run status plus each person's progress from the saved investigations. `investigate()`, its trace and its budget are unchanged. Evidence: `.shots/f3-investigate.log`. For u_arm the POST answered in 0.11 s and the run took 77 s with status polled every 5 s. It made 17 model calls ($0.0917) and 24 tool calls, the trace has 165 events and ends in `agent.completed`, and it produced 1 story, which the landing shows as "Winyu สืบให้แล้ว · 1 เรื่องน่าจับตา" (`.shots/f3-investigation-landing.png`).

**Rejected: tool-level background tasks.** Measured tool latency over the M5 walk's traces: every chat tool has a median of 1 to 49 ms and a maximum of 111 ms, except `run_job` (one call, 6.8 s). Nothing in the chat is slow enough to need the background. A deferred `run_job` would also answer after the reply ends, so the IT admin would have to come back for the result, which the product rule forbids. The bridge's own documentation for `untilIdle` (`@ag-ui/mastra` 1.1.6, checked against core 1.47) says the completion event does not reach the AG-UI stream.

## 3. Schedules

**What the copy did.** `lib/server/scheduler.ts` ran a 5-minute `setInterval` that read `job-runs.json` and started what was due: the engine once a local day, the watches every hour, the digest from 07:00 and the investigation from 06:00 with `INVESTIGATE_DAILY=1`. It wrote the last run only after a job finished. A long job therefore stayed due on the next tick, and two processes on the same data could both run it (inferred from the code).

**What Mastra gives.** A workflow can declare cron schedules with a timezone. The scheduler polls storage every 10 s and claims each fire with a compare-and-swap on `nextFireAt` before it runs, so each fire runs once across processes. The run id is `sched_<scheduleId>_<fireAt>`. A fire missed while the server was down runs once on the next tick after boot. The scheduler keeps a trigger history and lets you pause and resume schedules. It needs a storage adapter with the schedules domain, and LibSQL has one.

**Adopted.** The `winyu-jobs` workflow fires `engine` at 00:00, `watches` every hour and `digest` at 07:00, all Asia/Bangkok. `morning-investigation` fires at 06:00 when `INVESTIGATE_DAILY=1`. `WINYU_SCHEDULER=off` sets `scheduler.enabled: false`. When the scheduler is on, `instrumentation.ts` calls `mastra.startWorkers()`. The connector probe keeps its own 5-minute interval (`startConnectorProbe`), because a health ping as a stored workflow run would write 288 runs a day. `scheduler.ts`, its test, the `job-runs` store, the `tick` job and `runInvestigateJob` are deleted. Evidence:
- Two processes with a 5-second test cron on one LibSQL file: every fire ran in exactly one process (prototype `.shots/f3-proto/schedule.ts`).
- The dev server with the scheduler on created `wf_winyu-jobs__engine` (next fire 06/10 00:00 BKK), `__watches` (22:00 BKK) and `__digest` (06/10 07:00 BKK).
- `jobs.test.ts` checks that the workflow runs the named job and that an investigation run reports each person.

One difference from the copy: on the first boot of a fresh data folder, the engine waits for midnight instead of running at once. `bun run seed` already writes alerts and forecasts.

## 4. Signals

**What the copy did.** A colleague's handoff reply is written into the sender's thread in Mastra memory (`appendHandoffReply`), fenced as data. Both the restored transcript and the model see it on the next visit. Alerts belong to a person, not a thread. The landing, the bell and `get_alerts` show them.

**What Mastra gives.** `sendSignal` delivers context into a running loop, persists it for an idle thread's next turn, or wakes the idle thread into a new run.

**Rejected.** Persisting a signal for the next turn is what `appendHandoffReply` already does, and switching would change how history restores the reply card for no new behaviour. Waking an idle thread spends a model call on an answer nobody is there to read. Delivering into a running loop only helps when the sender is mid-reply at the moment a colleague answers, which is rare. Alerts have no thread to signal.

## 5. Time budgets and the fallback tier

**What happened.** AI-341: one chat step sent its first reasoning chunk after 5.6 s and then nothing for 235 s. It used 885 reasoning tokens, a normal amount, so the provider stream stalled; the model did not think for four minutes. Nothing bounded a model call, so the chat showed 'กำลังวางแผนคำตอบ…' for four minutes.

**What Mastra gives.** `modelSettings.timeout` (`@mastra/core` 1.74) has three budgets. `firstChunkMs` limits the wait for the first content chunk of a call. `stepMs` limits one whole model call. `totalMs` limits one execution session of a run. A call past `firstChunkMs` or `stepMs` fails with `MastraTimeoutError`, which Mastra does not retry on the same model. It moves to the next entry of the agent's model list. A run past `totalMs` fails at once and skips the fallbacks.

**Adopted.** `CHAT_TIME_BUDGET` in `agent.ts`, each number from the traces in `.data/mastra.db` (about 150 chat steps):

| Budget | Value | Why |
|---|---|---|
| `firstChunkMs` | 20 s | The first content chunk of a chat step arrived in 2.1 to 11.9 s (median about 3.5 s). |
| `stepMs` | 60 s | The longest normal step took 47 s, a long reply. AI-341's stall is caught only by this budget, because its first chunk came at 5.6 s. |
| `totalMs` | 150 s | The longest normal run took 42 s. 150 s leaves room for one failed-over step and is about as long as a person waits. |

- **Reasoning chunks count as content.** Mastra's `isContentChunk` accepts `reasoning-delta` as well as text and tool chunks. OpenRouter streams Gemini's reasoning summaries as `reasoning-delta`, and they arrive about 2.6 s into a call (`bun run probe:first-chunk`: 2.6 s on flex, 2.7 s on the standard tier). The longest gap between chunks in one probe was 3.4 s. A model that thinks without streaming would need a larger `firstChunkMs`.
- **The fallback.** The agent's model is a list: `flex` (`agentModel().chat()`, provider order `google-ai-studio/flex` then `google-ai-studio`) and then `standard` (`chatFallback()`, provider order `google-ai-studio` only). Both have `maxRetries: 0`, so a stalled or failed step makes one more attempt, on the standard tier. Each step starts on flex again. The fallback sends the same request with the same cache-marked system prompt. The cache did not suffer: in the stall demo the standard tier's first step read 16,231 of its 16,241 input tokens from the cache (`.data/model-calls.json`). A miss would cost one uncached prompt.
- **The meter keeps both attempts.** `meterMiddleware` records a call that is cancelled, fails or ends without a finish chunk as a ledger row with `aborted: true`, 0 tokens and `billedUsd: null`. The provider never reports what a cut call used, so these rows mean "unknown", not zero. Whether OpenRouter bills a cancelled stream is not visible from here.
- **No tool runs twice.** The durable agent's LLM step collects tool calls per attempt (`const toolCalls = []` inside the attempt loop of `createDurableLLMExecutionStep`) and returns only those of the attempt that finished. Tools run in the next workflow step, so the calls of a timed-out attempt are never run. The tool-call chunks of that attempt did reach the stream, though, so `ChatDurableAgent` holds tool-call chunks until the step stands (`withoutAbandonedCalls` in `durable.ts`). It drops held calls on the next attempt's `step-start` or an `error`, and lets them through with any other chunk. Test: `time-budget.test.ts` scripts a step that sends a tool call and goes silent. The tool runs once, and the client stream shows only the fallback's call.
- **Errors as text.** A run's error crosses Mastra's workflow as a plain object, which the AG-UI bridge printed as "[object Object]". `withReadableErrors` turns it into `MastraTimeoutError: …`, so the client and the trace can tell a timeout from other failures.
- **Durable runs.** Budgets are serialized with the run's options (`serializeModelSettings` keeps `timeout`), so a recovered run has them. `totalMs` is re-armed for each execution session: a run that pauses for an approval and continues, or one recovered after a restart, gets a fresh 150 s. A step cut by a budget is not checkpointed as a finished step, so a restart during the fallback repeats that step, as it repeats any interrupted step.
- **Background jobs.** The AI SDK jobs (investigation, digest, memory extraction, composer) use `agentModel().model()` on the same flex tier. They have no fallback; a person does not wait on them. `deadlineMiddleware` cuts any background call after 300 s, twice the longest default-effort thinking measured (145 s, AI-133), so a stalled call cannot hold a job slot forever.

**The chat.** `use-chat-session.ts` keeps a mark of what the last exchange shows (`progressOf`: steps, words, results, card parts). When a reply runs for 20 s with the mark unchanged, the trail shows 'ใช้เวลานานกว่าปกติ…' under its current line. When the server gives up, the run's error contains "timed out" and the exchange shows 'รอบนี้ตอบไม่ทัน ระบบรอโมเดลนานเกินไปจึงหยุดไว้ก่อน' with a 'ถามอีกครั้ง' button. Other failures show the existing failed line with the same button. A sign-out or a spent approval shows no button. A question that a reload finds without an answer also gets the button. Asking again keeps the transcript up to the last question and runs the agent again, so the question keeps its message id. The AG-UI bridge then sends no new message, and Mastra memory keeps the question once (`time-budget.test.ts`). The CopilotKit runner supersedes any run still going on the thread (`onConcurrentRun: "supersede"` aborts it), so asking again never runs beside an earlier run.

**Try it in development.** Both switches are ignored when `NODE_ENV=production`.
- `WINYU_DEV_STALL_FLEX=1` makes the flex tier open a stream and send nothing, without calling the provider. Each step then fails over at 20 s.
- `WINYU_CHAT_BUDGET_MS=first,step,total` replaces the budgets, in ms. `1000,60000,150000` makes both tiers time out and shows the failure line. A tiny `firstChunkMs` cannot show the fallback, because the durable agent applies one `modelSettings` to every model in the list.

**Evidence (2026-10-19).**
- Stall demo with `WINYU_DEV_STALL_FLEX=1`: run 26bffea7. Each of its two steps has an aborted flex row 20 s after the step began, then a standard-tier row. The reply took 89.8 s, the chat showed 'ใช้เวลานานกว่าปกติ…' at 20 s, and the answer card arrived (`resil-fallback-slow.png`, `resil-fallback.png` in the session scratchpad).
- Failure demo with `WINYU_CHAT_BUDGET_MS=1000,60000,150000`: the failure line and 'ถามอีกครั้ง' appeared after 2.6 s (`resil-failed.png`). After a restart with the normal budgets and a reload, the button answered the question. A second reload shows the question once.
- Tests: `time-budget.test.ts` (a stalled first chunk fails over, an all-stalled run ends in a timed-out run error with nothing in flight, asking again keeps one question, a silent tool step runs no tool twice), `usage-meter.test.ts` (an aborted stream is kept), `models.test.ts` (the fallback tier), `exchange-view.test.tsx`, `use-chat-session.test.ts`, `timeline.test.ts`.
## 6. History trimming

**What the copy did.** Mastra memory gives the chat agent the last 20 messages of the thread, and every one reached the model as stored: each earlier tool result with all its rows, and the model's encrypted thought signatures. Measured on the development store, each earlier turn added about 2,000 uncached input tokens to every call of every later turn (`bun run history:bench`, docs/memory.md, Long threads).

**What Mastra gives.** Input processors with a `processLLMRequest` hook, which rewrites the provider prompt just before each model call without touching stored messages. `ToolCallFilter` drops earlier tool calls with their results, optionally keeping the result's model view as text. `TokenLimiterProcessor` drops the oldest message groups past a token limit.

**Adopted.** `HistoryTrim` (`lib/harness/adapters/mastra/history-trim.ts`) runs at that stage. Before the newest question, a tool result longer than 600 characters becomes a stub (`ok`, `summary`, `query`, `error`, `code`, `rowCount` and a note), reasoning and thought signatures are dropped, and the oldest turns leave whole while history passes 8,000 estimated tokens. The current turn, the system messages and the cached prefix are untouched. Stored messages, the restored transcript, cards, recall and traces keep every result whole. Evidence: `history-trim.test.ts` runs six turns through the real chat agent with a scripted model, and the live check in docs/memory.md measured turn 4's first call at 1,255 uncached tokens against an estimated 8,414 for the same history untrimmed.

**Rejected.** `ToolCallFilter` drops the call's arguments, which a follow-up reads ("the first region we looked at"), and its kept text is the model view, which for `query_metric` holds every row. `TokenLimiterProcessor` counts the system prompt into its limit, stops the run with a tripwire when the system prompt alone passes it, and can keep a reply without its question.

## Open

- **A stall after the first chunk waits 60 s.** AI-341 would now fail over at 60 s and answer at about 75 s. A gap budget of about 15 s between chunks would catch it sooner. Mastra 1.74 has none, and the gap data is one probe (3.4 s longest), so it is not built.

- **Two module copies in `next dev`.** `instrumentation.ts` and the route handlers load separate copies of the app's modules, so they have two Mastra instances on one LibSQL file (measured: two builds logged). Recovery runs in the instrumentation copy. A browser that reconnects during a recovered run therefore gets no live `connect` replay. It sees the finished reply from memory on reload.
- **Lease loss.** One recovery attempt in dev lost Mastra's 30 s recovery lease after the event loop stalled for more than 30 s, on the first boot after a code change. The run stayed checkpointed and the next boot resumed it. The aborted attempt's model call was not metered (about $0.005).
- **A restart repeats the interrupted step.** The model call that was running at the kill is billed and then made again (step 2 in `.shots/f3-restart-trace.png`). Read tools run again. Write tools only run after an approval, and an approval pauses the run with a suspended snapshot.
- **A run that answered an approval** continues the Mastra run id of the run that asked, so a restart during it closes its trace as interrupted and does not resume it.
- **Investigation workflow runs** are not re-driven after a restart. People already done keep their stories, and the rest wait for the next fire.
- **One serving process per data folder.** Recovery trusts that no other live process owns a checkpointed run. `bun run studio` runs do not checkpoint, so they never recover.
