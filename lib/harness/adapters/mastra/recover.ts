import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { emitTo, inflightRuns, resumedRun, saveRun, type RunRecord } from "@/lib/harness/runtime";
import { threads } from "@/lib/server/threads-read";
import { mascopAgent } from "./agent";
import { recoverOnNextStream } from "./durable";
import { LEARNING, RUN_PATH, streamRun } from "./serve";
import type { ChatTurn } from "./turn";

const LOCAL_ORIGIN = "http://localhost";
const NOT_DURABLE = "the server stopped before Mastra checkpointed this run, so it could not be resumed";
const NO_PERSON = "the person who started this run no longer exists";

/** What became of one run a restart cut off: driven on to its end from Mastra's checkpoint, or closed in the trace as interrupted. */
export type Recovered = { runId: string; outcome: "resumed" | "closed" };

function turnOf(record: RunRecord): ChatTurn | null {
  const start = record.events.find((event) => event.type === "agent.started");
  if (start?.type !== "agent.started" || !record.threadId) return null;
  const { goal } = start.payload;
  return { runId: record.id, goal, threadId: record.threadId, preloadPacketId: threads().get(record.threadId)?.preload?.packetId ?? null, question: goal.userMessage || null, answers: [] };
}

function runRequest(turn: ChatTurn): Request {
  const threadId = turn.threadId ?? "";
  const messageId = turn.goal.id.slice(threadId.length + 1);
  const messages = turn.question ? [{ id: messageId, role: "user", content: turn.question }] : [];
  const body = { threadId, runId: turn.runId, state: {}, messages, tools: [], context: [], forwardedProps: turn.preloadPacketId ? { preloadPacketId: turn.preloadPacketId } : {} };
  return new Request(`${LOCAL_ORIGIN}${RUN_PATH}`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
}

function close(record: RunRecord, reason: string): Recovered {
  const run = resumedRun(record);
  emitTo(run, "runtime", { type: "agent.failed", payload: { reason } });
  saveRun(run);
  return { runId: record.id, outcome: "closed" };
}

async function resume(record: RunRecord, turn: ChatTurn): Promise<Recovered> {
  const user = findUser(record.userId);
  if (!user) return close(record, NO_PERSON);
  const run = resumedRun(record);
  emitTo(run, "runtime", { type: "agent.resumed", payload: { reason: "restart" } });
  recoverOnNextStream(run.id);
  const response = await streamRun(liveAccessFor(user), runRequest(turn), run, turn, LEARNING);
  void response.body?.cancel();
  return { runId: record.id, outcome: "resumed" };
}

/** After a restart, finishes every chat run the last process left mid-reply: a run Mastra checkpointed is driven on through the same serve path (the person's access, gateway, approvals, card stream, trace and learning) so a reconnecting browser can watch it and the trace ends whole; a run with no checkpoint is closed in its trace as interrupted. */
export async function recoverChatRuns(): Promise<Recovered[]> {
  const records = inflightRuns().all();
  if (records.length === 0) return [];
  const { runs } = await mascopAgent().listActiveRuns();
  const active = new Set(runs.map((entry) => entry.runId));
  const recovered: Recovered[] = [];
  for (const record of records) {
    const turn = turnOf(record);
    recovered.push(turn && active.has(record.id) ? await resume(record, turn) : close(record, NOT_DURABLE));
  }
  return recovered;
}
