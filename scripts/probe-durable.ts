import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { runStore } from "@/lib/harness/runtime";
import { storedMessages } from "@/lib/harness/adapters/mastra/history";
import { modelCalls } from "@/lib/server/model-ledger";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";

const BASE_URL = process.env.PROBE_URL ?? "http://localhost:3200";
const RUN_PATH = "/api/copilotkit/agent/mascop/run";
const CONNECT_PATH = "/api/copilotkit/agent/mascop/connect";
const CEO = "u_thana";
const QUESTION = "ยอดขายเดือนนี้แยกตามภาค";
const SETTLE_MS = Number(process.env.PROBE_SETTLE_MS ?? 45_000);
const POLL_MS = 1000;
const STARTED_FILE = process.env.PROBE_STARTED_FILE ?? ".data/probe-durable.json";
const MODE = process.argv.find((arg) => arg.startsWith("--"))?.slice(2) ?? "disconnect";

type Started = { threadId: string; runId: string; userId: string; at: string };
type AgUiEvent = { type: string; toolCallName?: string; delta?: string };

let failures = 0;

function check(ok: boolean, label: string): void {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
}

function eventsOf(lines: string): AgUiEvent[] {
  return lines.split("\n").flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    try {
      return [JSON.parse(line.slice(5)) as AgUiEvent];
    } catch {
      return [];
    }
  });
}

function bodyOf(started: Started, messages: unknown[]): string {
  return JSON.stringify({ threadId: started.threadId, runId: started.runId, state: {}, messages, tools: [], context: [], forwardedProps: {} });
}

async function post(path: string, userId: string, body: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream", cookie: `${SESSION_COOKIE}=${userId}` }, body, signal });
}

async function startAndCut(): Promise<Started> {
  const started: Started = { threadId: `probe-${randomUUID()}`, runId: randomUUID(), userId: CEO, at: new Date().toISOString() };
  const controller = new AbortController();
  const response = await post(RUN_PATH, CEO, bodyOf(started, [{ id: randomUUID(), role: "user", content: QUESTION }]), controller.signal);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`HTTP ${response.status} with no body`);
  const decoder = new TextDecoder();
  let seen = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    seen += decoder.decode(chunk.value, { stream: true });
    const cutAt = eventsOf(seen).find((event) => event.type === "TOOL_CALL_START");
    if (!cutAt) continue;
    console.log(`  cut the connection at TOOL_CALL_START ${cutAt.toolCallName} (${eventsOf(seen).length} events received)`);
    controller.abort();
    break;
  }
  writeFileSync(STARTED_FILE, JSON.stringify(started));
  return started;
}

function finished(started: Started): boolean {
  return runStore().get(started.runId)?.events.some((event) => event.type === "agent.completed" || event.type === "agent.failed") ?? false;
}

async function settle(started: Started): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  while (Date.now() < deadline && !finished(started)) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

function replyTextOf(content: unknown): string {
  const parts = (content as { parts?: { type?: string; text?: string }[] } | null)?.parts ?? [];
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
}

async function verify(started: Started): Promise<void> {
  await settle(started);
  const trace = runStore().get(started.runId);
  const types = trace?.events.map((event) => event.type) ?? [];
  check(types.includes("agent.started") && types.includes("agent.completed"), `run ${started.runId} trace saved with agent.started and agent.completed (${types.length} events: ${[...new Set(types)].join(", ")})`);
  check(types.includes("tool.completed"), "the trace holds the run's tool calls (tool.completed)");
  const stored = await storedMessages(started.threadId, started.userId);
  const reply = stored.filter((message) => message.role === "assistant").map((message) => replyTextOf(message.content)).join("");
  check(reply.trim().length > 0, `Mastra memory holds the finished reply (${stored.length} messages, ${reply.length} chars of text)`);
  const connect = await post(CONNECT_PATH, started.userId, bodyOf({ ...started, runId: randomUUID() }, []));
  const replayed = eventsOf(await connect.text());
  const text = replayed.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta ?? "").join("");
  console.log(`  connect replay: HTTP ${connect.status}, ${replayed.length} events, ${text.length} chars of text`);
  const calls = modelCalls().where((call) => call.turnId === started.runId);
  console.log(`  model calls for the run: ${calls.length} · $${calls.reduce((sum, call) => sum + (call.billedUsd ?? call.estimatedUsd), 0).toFixed(4)}`);
}

if (MODE === "disconnect") {
  console.log(`disconnect: ${CEO} asks "${QUESTION}", the client leaves mid-run`);
  await verify(await startAndCut());
} else if (MODE === "start") {
  console.log(`start: ${CEO} asks "${QUESTION}", the client leaves mid-run; restart the server, then run --check`);
  const started = await startAndCut();
  console.log(`  thread ${started.threadId} run ${started.runId}`);
} else if (MODE === "check") {
  const started = JSON.parse(readFileSync(STARTED_FILE, "utf8")) as Started;
  console.log(`check: thread ${started.threadId} run ${started.runId}`);
  await verify(started);
} else {
  throw new Error(`unknown mode --${MODE}: use --disconnect, --start or --check`);
}
console.log(failures === 0 ? "probe:durable PASS" : `probe:durable FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
