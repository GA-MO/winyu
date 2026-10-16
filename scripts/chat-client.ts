import { randomUUID } from "node:crypto";
import { sessionCookie } from "@/lib/server/auth/session-token";

const BASE_URL = process.env.PROBE_URL ?? "http://localhost:3100";
const RUN_PATH = "/api/copilotkit/agent/winyu/run";

/** One AG-UI event of a chat run's stream, with the fields the probes read. */
export type AgUiEvent = { type: string; toolCallId?: string; toolCallName?: string; content?: string; delta?: string; message?: string; outcome?: { type: string; interrupts: Interrupt[] } };
/** An approval or other pause a run finished with. */
export type Interrupt = { id: string; reason: string; toolCallId: string; metadata?: { mastra?: { toolName?: string } } };
/** One finished chat run as the client saw it. */
export type Reply = { runId: string; status: number; events: AgUiEvent[]; text: string };
/** A chat thread signed in as one persona, with the questions sent so far. */
export type Thread = { id: string; userId: string; messages: { id: string; role: "user"; content: string }[] };

function eventsOf(sse: string): AgUiEvent[] {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    try {
      return [JSON.parse(line.slice(5)) as AgUiEvent];
    } catch {
      return [];
    }
  });
}

function cookieOf(userId: string): string {
  const cookie = sessionCookie({ via: "demo", userId });
  return `${cookie.name}=${cookie.value}`;
}

/** A new thread for this persona that opens with the question. */
export function threadOf(userId: string, question: string): Thread {
  return { id: `probe-${randomUUID()}`, userId, messages: [{ id: randomUUID(), role: "user", content: question }] };
}

/** The same thread with one more question asked. */
export function followUp(thread: Thread, question: string): Thread {
  return { ...thread, messages: [...thread.messages, { id: randomUUID(), role: "user", content: question }] };
}

/** Posts the thread to the chat endpoint with the persona's session cookie, and the approval answer when resuming, then reads the whole event stream. */
export async function run(thread: Thread, resume: unknown[] | null = null): Promise<Reply> {
  const runId = randomUUID();
  const body = { threadId: thread.id, runId, state: {}, messages: thread.messages, tools: [], context: [], forwardedProps: {}, ...(resume ? { resume } : {}) };
  const response = await fetch(`${BASE_URL}${RUN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", cookie: cookieOf(thread.userId) },
    body: JSON.stringify(body),
  });
  const events = eventsOf(await response.text());
  const text = events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta ?? "").join("");
  return { runId, status: response.status, events, text };
}

/** The parsed result of the reply's first call to this tool, or null. */
export function resultOf(reply: Reply, tool: string): unknown {
  const call = reply.events.find((event) => event.type === "TOOL_CALL_START" && event.toolCallName === tool);
  const result = call ? reply.events.find((event) => event.type === "TOOL_CALL_RESULT" && event.toolCallId === call.toolCallId) : undefined;
  if (!result?.content) return null;
  try {
    return JSON.parse(result.content);
  } catch {
    return result.content;
  }
}

/** The interrupts the reply's run finished with. */
export function interruptsOf(reply: Reply): Interrupt[] {
  const finished = reply.events.find((event) => event.type === "RUN_FINISHED");
  return finished?.outcome?.type === "interrupt" ? finished.outcome.interrupts : [];
}
