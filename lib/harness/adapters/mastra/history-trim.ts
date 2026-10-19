import { MessageList, type MastraDBMessage } from "@mastra/core/agent/message-list";
import type { ProcessLLMRequestArgs, ProcessLLMRequestResult, Processor } from "@mastra/core/processors";
import { TH } from "@/lib/i18n/th";

const KEEP_WHOLE_CHARS = 600;
const CHARS_PER_TOKEN = 1.5;
const ROW_LISTS = ["rows", "data", "conversations"] as const;
const KEPT_FIELDS = ["ok", "summary", "query", "error", "code"] as const;

/** History tokens a call may carry after old results are stubbed: about six stubbed turns, the most `lastMessages: 20` usually brings; past it the oldest turns leave whole, so long replies cannot grow every call without bound. */
export const HISTORY_TOKEN_CEILING = 8_000;

/** The prompt one model call receives, after Mastra has turned the message list into provider messages. */
export type ModelPrompt = ProcessLLMRequestArgs["prompt"];

type PromptMessage = ModelPrompt[number];
type ToolResultOutput = Extract<Extract<PromptMessage, { role: "tool" }>["content"][number], { type: "tool-result" }>["output"];
type JsonValue = Extract<ToolResultOutput, { type: "json" }>["value"];
type JsonRecord = { [key: string]: JsonValue };

/** One row of Mastra's message table, as `mastra_messages` holds it. */
export type StoredMessageRow = { id: string; role: string; content: string; createdAt: string; type: string; resourceId: string };

function dbMessageOf(threadId: string, row: StoredMessageRow): MastraDBMessage {
  return { id: row.id, role: row.role as MastraDBMessage["role"], content: JSON.parse(row.content), createdAt: new Date(row.createdAt), threadId, resourceId: row.resourceId, type: row.type };
}

/** The provider prompt Mastra builds from a thread's stored messages, without a model call: what the model reads as history. */
export async function storedHistoryPrompt(threadId: string, rows: StoredMessageRow[]): Promise<ModelPrompt> {
  const list = new MessageList({ threadId });
  list.add(rows.map((row) => dbMessageOf(threadId, row)), "memory");
  return list.get.all.aiV5.llmPrompt();
}

function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowCountOf(value: JsonRecord): number | null {
  const list = ROW_LISTS.map((key) => value[key]).find((candidate) => Array.isArray(candidate));
  return Array.isArray(list) ? list.length : null;
}

/** What a follow-up needs from an old result: whether it worked, how many rows, its summary line and the query that made it; the rows stay in memory and on the cards. */
function stubOf(value: JsonRecord): JsonRecord {
  const kept: JsonRecord = {};
  for (const key of KEPT_FIELDS) {
    const field = value[key];
    if (field !== undefined && field !== null) kept[key] = field;
  }
  const rowCount = rowCountOf(value);
  return { ...kept, ...(rowCount === null ? {} : { rowCount }), trimmed: TH.harness.trimmedResult };
}

function trimmedOutput(output: ToolResultOutput): ToolResultOutput {
  if (output.type !== "json" || !isRecord(output.value)) return output;
  if (JSON.stringify(output.value).length <= KEEP_WHOLE_CHARS) return output;
  return { type: "json", value: stubOf(output.value) };
}

function withStubbedResults(message: PromptMessage): PromptMessage {
  if (message.role !== "tool") return message;
  return { ...message, content: message.content.map((part) => (part.type === "tool-result" ? { ...part, output: trimmedOutput(part.output) } : part)) };
}

function billedChars(message: PromptMessage): number {
  if (message.role === "system") return 0;
  let chars = 0;
  for (const part of message.content) {
    if (part.type === "text") chars += part.text.length;
    if (part.type === "tool-call") chars += JSON.stringify(part.input).length;
    if (part.type === "tool-result") chars += JSON.stringify(part.output).length;
  }
  return chars;
}

/** Estimated input tokens of the messages as the model bills them: earlier turns' reasoning is sent back but measured as not billed (docs/memory.md, Long threads). */
export function historyTokens(messages: readonly PromptMessage[]): number {
  return Math.ceil(messages.reduce((sum, message) => sum + billedChars(message), 0) / CHARS_PER_TOKEN);
}

function turnsOf(history: readonly PromptMessage[]): PromptMessage[][] {
  const turns: PromptMessage[][] = [];
  for (const message of history) {
    const current = turns.at(-1);
    if (message.role === "user" || !current) turns.push([message]);
    else current.push(message);
  }
  return turns;
}

function underCeiling(history: readonly PromptMessage[]): PromptMessage[] {
  const turns = turnsOf(history);
  let tokens = historyTokens(history);
  while (turns.length > 0 && tokens > HISTORY_TOKEN_CEILING) tokens -= historyTokens(turns.shift() ?? []);
  return turns.flat();
}

/** The prompt with earlier turns made light: each old tool result becomes a stub, and the oldest turns leave whole while history passes the ceiling; the system messages before the first turn and the current turn (from the newest question on) stay as they are. */
export function trimmedHistory(prompt: ModelPrompt): ModelPrompt {
  const newestQuestion = prompt.findLastIndex((message) => message.role === "user");
  if (newestQuestion <= 0) return prompt;
  const firstTurn = prompt.findIndex((message) => message.role !== "system");
  const history = underCeiling(prompt.slice(firstTurn, newestQuestion).map(withStubbedResults));
  return [...prompt.slice(0, firstTurn), ...history, ...prompt.slice(newestQuestion)];
}

/** Before each model call, earlier turns reach the model without their rows (`trimmedHistory`); the change is transient, so stored messages, the cards, recall and traces keep every result whole. */
export class HistoryTrim implements Processor<"history-trim"> {
  readonly id = "history-trim" as const;

  async processLLMRequest({ prompt }: ProcessLLMRequestArgs): Promise<ProcessLLMRequestResult> {
    return { prompt: trimmedHistory(prompt) };
  }
}
