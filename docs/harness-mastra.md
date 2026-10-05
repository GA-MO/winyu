# mascop's harness on Mastra

mascop copied Winyu's harness: the gateway, the run trace, the approvals ledger, the audit, a `setInterval` scheduler and the morning investigation. Phase F3 (2026-10-05) measured four Mastra harness features against that copy and adopted the ones that did better. This page records, for each one, what the copy did, what Mastra gives, the decision and the evidence.

| Need | Decision | Where |
|---|---|---|
| A chat run outlives a closed tab | Fixed in mascop; CopilotKit's runner already kept the run going | `observeReply` in `lib/harness/adapters/mastra/turn.ts` |
| A chat run outlives a server restart | Adopted: Mastra durable agent, run checkpoints, recovery at boot | `durable.ts`, `recover.ts`, `instrumentation.ts` |
| Long work does not block | Adopted for the investigation as a Mastra workflow started in the background; tool-level background tasks rejected | `jobs.ts`, `app/api/jobs/run/route.ts` |
| Jobs on a timetable | Adopted: Mastra scheduled workflows; the copied scheduler is deleted | `jobs.ts` |
| An inbox event reaches an idle thread | Rejected: mascop already writes handoff replies into the thread | `appendHandoffReply` in `history.ts` |

## 1. Durable runs

**What the copy did.** A chat run was one HTTP request. CopilotKit's `InMemoryAgentRunner` starts the agent detached from the request, so the agent kept going when the browser left. mascop's own end-of-run work was different: `observeReply` ended the harness run in the `flush` of a `TransformStream` on the response, and a client that leaves cancels the stream, so `flush` never ran. Measured with `bun run probe:durable --disconnect` on the old code: the reply was in Mastra memory and the `connect` replay, but the run trace was never saved (0 events). The same path also skipped `recordAsked`, so an approval asked in that run could not be answered later, the composed-card audit row, and memory extraction. A restart was worse: after `kill -9` mid-run, Mastra memory held 0 messages (not even the question), there was no trace, and one model call was billed for nothing.

**What Mastra gives.** `DurableAgent` runs the agent loop as a workflow, checkpoints the run state in storage (LibSQL works), streams through PubSub with a replay cache, and can re-drive a run from its last checkpoint with `recover(runId)`. Its automatic recovery (`recovery.durableAgents: 'auto'`) re-drives runs on its own, outside any request.

**Adopted.**
- `observeReply` reads its own `tee` of the reply, so the run, not the connection, decides when the reply is over. This is a mascop fix and needs no Mastra feature.
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

**Adopted.** The investigation is the `morning-investigation` workflow. It runs three people at a time (`foreach`). `POST /api/jobs/run {"job":"investigate","user":…}` returns `202 {runId}` at once, and `GET /api/jobs/run?run=<runId>` reports Mastra's run status plus each person's progress from the saved investigations. `investigate()`, its trace and its budget are unchanged. Evidence: `.shots/f3-investigate.log`. For u_arm the POST answered in 0.11 s and the run took 77 s with status polled every 5 s. It made 17 model calls ($0.0917) and 24 tool calls, the trace has 165 events and ends in `agent.completed`, and it produced 1 story, which the landing shows as "mascop สืบให้แล้ว · 1 เรื่องน่าจับตา" (`.shots/f3-investigation-landing.png`).

**Rejected: tool-level background tasks.** Measured tool latency over the M5 walk's traces: every chat tool has a median of 1 to 49 ms and a maximum of 111 ms, except `run_job` (one call, 6.8 s). Nothing in the chat is slow enough to need the background. A deferred `run_job` would also answer after the reply ends, so the IT admin would have to come back for the result, which the product rule forbids. The bridge's own documentation for `untilIdle` (`@ag-ui/mastra` 1.1.6, checked against core 1.47) says the completion event does not reach the AG-UI stream.

## 3. Schedules

**What the copy did.** `lib/server/scheduler.ts` ran a 5-minute `setInterval` that read `job-runs.json` and started what was due: the engine once a local day, the watches every hour, the digest from 07:00 and the investigation from 06:00 with `INVESTIGATE_DAILY=1`. It wrote the last run only after a job finished. A long job therefore stayed due on the next tick, and two processes on the same data could both run it (inferred from the code).

**What Mastra gives.** A workflow can declare cron schedules with a timezone. The scheduler polls storage every 10 s and claims each fire with a compare-and-swap on `nextFireAt` before it runs, so each fire runs once across processes. The run id is `sched_<scheduleId>_<fireAt>`. A fire missed while the server was down runs once on the next tick after boot. The scheduler keeps a trigger history and lets you pause and resume schedules. It needs a storage adapter with the schedules domain, and LibSQL has one.

**Adopted.** The `mascop-jobs` workflow fires `engine` at 00:00, `watches` every hour and `digest` at 07:00, all Asia/Bangkok. `morning-investigation` fires at 06:00 when `INVESTIGATE_DAILY=1`. `MASCOP_SCHEDULER=off` sets `scheduler.enabled: false`. When the scheduler is on, `instrumentation.ts` calls `mastra.startWorkers()`. The connector probe keeps its own 5-minute interval (`startConnectorProbe`), because a health ping as a stored workflow run would write 288 runs a day. `scheduler.ts`, its test, the `job-runs` store, the `tick` job and `runInvestigateJob` are deleted. Evidence:
- Two processes with a 5-second test cron on one LibSQL file: every fire ran in exactly one process (prototype `.shots/f3-proto/schedule.ts`).
- The dev server with the scheduler on created `wf_mascop-jobs__engine` (next fire 06/10 00:00 BKK), `__watches` (22:00 BKK) and `__digest` (06/10 07:00 BKK).
- `jobs.test.ts` checks that the workflow runs the named job and that an investigation run reports each person.

One difference from the copy: on the first boot of a fresh data folder, the engine waits for midnight instead of running at once. `bun run seed` already writes alerts and forecasts.

## 4. Signals

**What the copy did.** A colleague's handoff reply is written into the sender's thread in Mastra memory (`appendHandoffReply`), fenced as data. Both the restored transcript and the model see it on the next visit. Alerts belong to a person, not a thread. The landing, the bell and `get_alerts` show them.

**What Mastra gives.** `sendSignal` delivers context into a running loop, persists it for an idle thread's next turn, or wakes the idle thread into a new run.

**Rejected.** Persisting a signal for the next turn is what `appendHandoffReply` already does, and switching would change how history restores the reply card for no new behaviour. Waking an idle thread spends a model call on an answer nobody is there to read. Delivering into a running loop only helps when the sender is mid-reply at the moment a colleague answers, which is rare. Alerts have no thread to signal.

## Open

- **Two module copies in `next dev`.** `instrumentation.ts` and the route handlers load separate copies of the app's modules, so they have two Mastra instances on one LibSQL file (measured: two builds logged). Recovery runs in the instrumentation copy. A browser that reconnects during a recovered run therefore gets no live `connect` replay. It sees the finished reply from memory on reload.
- **Lease loss.** One recovery attempt in dev lost Mastra's 30 s recovery lease after the event loop stalled for more than 30 s, on the first boot after a code change. The run stayed checkpointed and the next boot resumed it. The aborted attempt's model call was not metered (about $0.005).
- **A restart repeats the interrupted step.** The model call that was running at the kill is billed and then made again (step 2 in `.shots/f3-restart-trace.png`). Read tools run again. Write tools only run after an approval, and an approval pauses the run with a suspended snapshot.
- **A run that answered an approval** continues the Mastra run id of the run that asked, so a restart during it closes its trace as interrupted and does not resume it.
- **Investigation workflow runs** are not re-driven after a restart. People already done keep their stories, and the rest wait for the next fire.
- **One serving process per data folder.** Recovery trusts that no other live process owns a checkpointed run. `bun run studio` runs do not checkpoint, so they never recover.
