import { randomUUID } from "node:crypto";
import type { AccessContext } from "@/lib/contracts";
import { COMPOSED_CARD_ACTIVITY, type ComposedSurface } from "@/lib/compose/catalog";
import { serveCopilot } from "@/lib/harness/adapters/mastra/serve";
import type { Channel } from "./types";

const RUN_URL = "http://localhost/api/copilotkit/agent/mascop/run";
const SSE_DATA = "data:";
const SPENT_STATUS = 409;
const PARAGRAPH = "\n\n";

/** The person's message a turn answers; an approval's answer re-sends the message that raised it so the run continues the same goal. */
export type ChannelMessage = { id: string; content: string };

/** The approval answer a turn carries, quoting the interrupt the asking run raised. */
export type ChannelResume = { interruptId: string; approved: boolean };

/** One tool call the agent made in a turn, with its arguments and, once it ran, its result. */
export type TurnCall = { toolCallId: string; tool: string; args: unknown; result: unknown; done: boolean };

/** An approval the turn ended on: the interrupt to quote back and the call it pauses. */
export type TurnAsked = { interruptId: string; toolCallId: string; tool: string };

/** What one agent turn produced for a chat app: the words, the tool calls with their results, the composed cards that held, the approval it stopped at, and how it failed. `spent`: the approvals ledger refused the answer before any run started. */
export type ChannelTurn = { text: string; calls: TurnCall[]; composed: ComposedSurface[]; asked: TurnAsked[]; error: string | null; spent: boolean };

type AgUiEvent = {
  type?: unknown;
  messageId?: unknown;
  delta?: unknown;
  toolCallId?: unknown;
  toolCallName?: unknown;
  content?: unknown;
  activityType?: unknown;
  message?: unknown;
  outcome?: { type?: unknown; interrupts?: { id?: unknown; toolCallId?: unknown; metadata?: { mastra?: { toolName?: unknown } } }[] };
};

function stringOr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function eventsOf(sse: string): AgUiEvent[] {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith(SSE_DATA)) return [];
    const event = parsed(line.slice(SSE_DATA.length));
    return typeof event === "object" && event !== null ? [event as AgUiEvent] : [];
  });
}

function askedOf(event: AgUiEvent): TurnAsked[] {
  if (event.type !== "RUN_FINISHED" || event.outcome?.type !== "interrupt") return [];
  return (event.outcome.interrupts ?? []).flatMap((interrupt) => {
    const interruptId = stringOr(interrupt.id);
    const toolCallId = stringOr(interrupt.toolCallId);
    return interruptId && toolCallId ? [{ interruptId, toolCallId, tool: stringOr(interrupt.metadata?.mastra?.toolName) ?? "unknown" }] : [];
  });
}

function composedOf(event: AgUiEvent): ComposedSurface | null {
  if (event.type !== "ACTIVITY_SNAPSHOT" || event.activityType !== COMPOSED_CARD_ACTIVITY) return null;
  const surface = event.content as ComposedSurface | null;
  return surface && Array.isArray(surface.components) ? surface : null;
}

/** Folds the AG-UI events of one reply (after the card stream took its card blocks out) into what a chat app shows. */
export function turnOfEvents(events: readonly AgUiEvent[]): Omit<ChannelTurn, "spent"> {
  const texts = new Map<string, string>();
  const calls = new Map<string, TurnCall>();
  const argText = new Map<string, string>();
  const surfaces = new Map<string, ComposedSurface>();
  let error: string | null = null;
  for (const event of events) {
    const messageId = stringOr(event.messageId);
    const toolCallId = stringOr(event.toolCallId);
    if (event.type === "TEXT_MESSAGE_CONTENT" && messageId && typeof event.delta === "string") texts.set(messageId, `${texts.get(messageId) ?? ""}${event.delta}`);
    if (event.type === "TOOL_CALL_START" && toolCallId) calls.set(toolCallId, { toolCallId, tool: stringOr(event.toolCallName) ?? "unknown", args: {}, result: null, done: false });
    if (event.type === "TOOL_CALL_ARGS" && toolCallId && typeof event.delta === "string") argText.set(toolCallId, `${argText.get(toolCallId) ?? ""}${event.delta}`);
    if (event.type === "TOOL_CALL_RESULT" && toolCallId) {
      const call = calls.get(toolCallId);
      if (call) calls.set(toolCallId, { ...call, result: typeof event.content === "string" ? parsed(event.content) : event.content, done: true });
    }
    if (event.type === "RUN_ERROR") error = stringOr(event.message) ?? "run error";
    const surface = composedOf(event);
    if (surface) surfaces.set(surface.surfaceId, surface);
  }
  const withArgs = [...calls.values()].map((call) => ({ ...call, args: parsed(argText.get(call.toolCallId) ?? "{}") }));
  const text = [...texts.values()].map((part) => part.trim()).filter(Boolean).join(PARAGRAPH);
  return { text, calls: withArgs, composed: [...surfaces.values()].filter((surface) => surface.done), asked: events.flatMap(askedOf), error };
}

/** Runs one turn for a chat app through the same route the web chat uses (harness run, gateway, approvals ledger, thread record, card stream, memory), as the person in `access`, audited under the channel's initiator. */
export async function converse(access: AccessContext, channel: Channel, threadId: string, message: ChannelMessage, resume: ChannelResume | null): Promise<ChannelTurn> {
  const body = {
    threadId,
    runId: randomUUID(),
    state: {},
    messages: [{ id: message.id, role: "user", content: message.content }],
    tools: [],
    context: [],
    forwardedProps: {},
    ...(resume ? { resume: [{ interruptId: resume.interruptId, status: "resolved", payload: { approved: resume.approved } }] } : {}),
  };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  const response = await serveCopilot(access, request, { learn: true, initiator: channel });
  const sse = await response.text();
  if (response.status === SPENT_STATUS) return { text: "", calls: [], composed: [], asked: [], error: null, spent: true };
  const turn = turnOfEvents(eventsOf(sse));
  return { ...turn, error: turn.error ?? (response.ok ? null : `HTTP ${response.status}`), spent: false };
}
