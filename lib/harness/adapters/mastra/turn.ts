import type { Goal } from "@/lib/harness/types";

const QUESTION_MAX_CHARS = 300;
const UNTHREADED = "unthreaded";
const APPROVAL_PREFIX = "mastra-approval::";
const SNAPSHOT_SEPARATOR = "::";
const SSE_DATA = "data:";

type InputMessage = { id?: unknown; role?: unknown; content?: unknown };
type ResumeEntry = { interruptId?: unknown; status?: unknown; payload?: unknown };

/** An AG-UI run request as Winyu reads it; the browser sent all of it, so every field is checked. */
export type RunInput = { threadId?: unknown; runId?: unknown; messages?: InputMessage[]; resume?: ResumeEntry[]; forwardedProps?: { preloadPacketId?: unknown } } | null;

/** The person's yes or no to one approval interrupt, and the tool call it covers. */
export type ApprovalAnswer = { interruptId: string; toolCallId: string; approved: boolean };

/** What one run request carries for the harness: its run id, the goal, the thread, and the approval answered. */
export type ChatTurn = { runId: string; goal: Goal; threadId: string | null; preloadPacketId: string | null; question: string | null; answers: ApprovalAnswer[] };

function stringOr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.flatMap((part: { type?: unknown; text?: unknown }) => (part?.type === "text" && typeof part.text === "string" ? [part.text] : [])).join(" ").trim();
}

function toolCallIdOf(interruptId: string): string {
  const snapshotAndCall = interruptId.startsWith(APPROVAL_PREFIX) ? interruptId.slice(APPROVAL_PREFIX.length) : interruptId;
  const separator = snapshotAndCall.indexOf(SNAPSHOT_SEPARATOR);
  return separator >= 0 ? snapshotAndCall.slice(separator + SNAPSHOT_SEPARATOR.length) : snapshotAndCall;
}

function approvedOf(entry: ResumeEntry): boolean {
  if (entry.status !== "resolved") return false;
  if (entry.payload === true) return true;
  return typeof entry.payload === "object" && entry.payload !== null && (entry.payload as { approved?: unknown }).approved === true;
}

/** Every resume entry of this request read as an approval answer; the server only ever raises approval interrupts, so an entry it never asked for is still an answer the approval ledger then refuses. */
export function answersOf(input: RunInput): ApprovalAnswer[] {
  return (input?.resume ?? []).flatMap((entry) => {
    const interruptId = stringOr(entry?.interruptId);
    if (!interruptId) return [];
    return [{ interruptId, toolCallId: toolCallIdOf(interruptId), approved: approvedOf(entry) }];
  });
}

/** Reads one run request into the run's starting facts; the goal id follows the person's last message, so the run that answers an approval continues the goal of the run that asked. */
export function chatTurnOf(input: RunInput, fallbackRunId: string): ChatTurn {
  const threadId = stringOr(input?.threadId);
  const lastUser = [...(input?.messages ?? [])].reverse().find((message) => message?.role === "user");
  const text = textOf(lastUser?.content);
  const question = text ? text.slice(0, QUESTION_MAX_CHARS) : null;
  const runId = stringOr(input?.runId) ?? fallbackRunId;
  const messageId = stringOr(lastUser?.id);
  return {
    runId,
    goal: { id: messageId ? `${threadId ?? UNTHREADED}:${messageId}` : runId, userMessage: question ?? "", intent: null, status: "active" },
    threadId,
    preloadPacketId: stringOr(input?.forwardedProps?.preloadPacketId),
    question,
    answers: answersOf(input),
  };
}

/** One approval the agent raised: the interrupt id the answer must quote, the call it pauses, and its tool. */
export type AskedApproval = { interruptId: string; toolCallId: string; tool: string };

/** What the reply stream showed: the tool calls that returned a result (each drawn as a card), the approvals asked, and the error that ended it. */
export type ReplySeen = { results: string[]; asked: AskedApproval[]; text: boolean; error: string | null };

type AgUiEvent = {
  type?: unknown;
  toolCallId?: unknown;
  toolCallName?: unknown;
  message?: unknown;
  outcome?: { type?: unknown; interrupts?: { id?: unknown; toolCallId?: unknown; metadata?: { mastra?: { toolName?: unknown } } }[] };
};

function eventsOf(lines: readonly string[]): AgUiEvent[] {
  return lines.flatMap((line) => {
    if (!line.startsWith(SSE_DATA)) return [];
    try {
      return [JSON.parse(line.slice(SSE_DATA.length)) as AgUiEvent];
    } catch {
      return [];
    }
  });
}

/** Tool names of calls an earlier run started, keyed by tool call id: the run that answers an approval streams the result of a call it never started. */
export type KnownCalls = ReadonlyMap<string, string>;

function askedOf(event: AgUiEvent, names: KnownCalls): AskedApproval[] {
  if (event.type !== "RUN_FINISHED" || event.outcome?.type !== "interrupt") return [];
  return (event.outcome.interrupts ?? []).flatMap((interrupt) => {
    const interruptId = stringOr(interrupt.id);
    const toolCallId = stringOr(interrupt.toolCallId);
    if (!interruptId || !toolCallId) return [];
    const tool = stringOr(interrupt.metadata?.mastra?.toolName) ?? names.get(toolCallId);
    return tool ? [{ interruptId, toolCallId, tool }] : [];
  });
}

/** Folds the AG-UI events of one reply into what the harness records about it; a result is named by the call that started it in this reply or in `known`, and a result no one can name is left out rather than recorded as a guess. */
export function seenOf(events: readonly AgUiEvent[], known: KnownCalls = new Map()): ReplySeen {
  const names = new Map(known);
  const results: string[] = [];
  let error: string | null = null;
  for (const event of events) {
    const toolCallId = stringOr(event.toolCallId);
    const toolName = stringOr(event.toolCallName);
    if (event.type === "TOOL_CALL_START" && toolCallId && toolName) names.set(toolCallId, toolName);
    const shown = toolCallId ? names.get(toolCallId) : undefined;
    if (event.type === "TOOL_CALL_RESULT" && shown) results.push(shown);
    if (event.type === "RUN_ERROR") error = stringOr(event.message) ?? "run error";
  }
  return { results, asked: events.flatMap((event) => askedOf(event, names)), text: events.some((event) => event.type === "TEXT_MESSAGE_CONTENT"), error };
}

async function readToEnd(body: ReadableStream<Uint8Array>, known: KnownCalls, onEnd: (seen: ReplySeen) => void): Promise<void> {
  const decoder = new TextDecoder();
  const events: AgUiEvent[] = [];
  const reader = body.getReader();
  let pending = "";
  let failure: string | null = null;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      pending += decoder.decode(chunk.value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      events.push(...eventsOf(lines));
    }
    events.push(...eventsOf([pending]));
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const seen = seenOf(events, known);
  onEnd(failure && !seen.error ? { ...seen, error: failure } : seen);
}

/** Passes an AG-UI event stream to the client untouched and reads its own copy to the end (naming results by `known` when this reply did not start their call), so `onEnd` runs once with what the reply showed even when the client leaves mid-run: the run, not the connection, decides when the reply is over. */
export function observeReply(response: Response, known: KnownCalls, onEnd: (seen: ReplySeen) => void): Response {
  if (!response.body) {
    onEnd({ results: [], asked: [], text: false, error: response.ok ? null : `HTTP ${response.status}` });
    return response;
  }
  const [toClient, toHarness] = response.body.tee();
  void readToEnd(toHarness, known, onEnd);
  return new Response(toClient, { status: response.status, statusText: response.statusText, headers: response.headers });
}
