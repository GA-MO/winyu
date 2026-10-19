import path from "node:path";
import { Database } from "bun:sqlite";
import { historyTokens, storedHistoryPrompt, trimmedHistory, type ModelPrompt, type StoredMessageRow } from "@/lib/harness/adapters/mastra/history-trim";

const USAGE = `usage: bun run history:bench [--mastra-db=<path>]
  Measures what a thread's history costs each chat call, from a Mastra store, without a model call:
  positions   input tokens of each chat call by the turn's position in its thread, from the traced model steps
  parts       the history of each traced turn rebuilt from stored messages, by part, against the uncached tokens of the turn's first call,
              and the history tokens the same prompt carries once the chat agent's HistoryTrim has stubbed earlier results
  longest     the thread with the most questions, all of it as the history of its next call, by part, before and after HistoryTrim`;

const QUESTION_SLACK_MS = 5_000;
const CHARS_PER_TOKEN: Record<Part, number> = { question: 1.7, replyText: 1.7, reasoning: Infinity, signature: 15, toolCall: 1.7, toolResult: 1.7 };
const PARTS = ["question", "replyText", "reasoning", "signature", "toolCall", "toolResult"] as const;

type Part = (typeof PARTS)[number];
type PartChars = Record<Part, number>;
type StepRow = { traceId: string; threadId: string; runStart: string; stepStart: string; input: number | null; cached: number | null };
type Turn = { threadId: string; position: number; start: string; questionAt: string; calls: { input: number; cached: number }[] };
type Question = { createdAt: string };

function flag(name: string): string | null {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : null;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

function tracedTurns(db: Database): Turn[] {
  const rows = db
    .query(
      `select r.traceId, r.threadId, r.startedAt runStart, s.startedAt stepStart,
         json_extract(json(s.attributes), '$.usage.inputTokens') input,
         json_extract(json(s.attributes), '$.usage.cachedInputTokens') cached
       from mastra_ai_spans r join mastra_ai_spans s on s.traceId = r.traceId and s.spanType = 'model_step'
       where r.spanType = 'agent_run' and r.threadId is not null and r.threadId <> ''
       order by r.threadId, r.startedAt, s.startedAt`,
    )
    .all() as StepRow[];
  const byTrace = new Map<string, Turn>();
  for (const row of rows) {
    if (row.input === null) continue;
    const turn = byTrace.get(row.traceId) ?? { threadId: row.threadId, position: 0, start: row.runStart, questionAt: row.runStart, calls: [] };
    turn.calls.push({ input: row.input, cached: row.cached ?? 0 });
    byTrace.set(row.traceId, turn);
  }
  const turns = [...byTrace.values()];
  for (const turn of turns) placeInThread(db, turn);
  return turns;
}

function placeInThread(db: Database, turn: Turn): void {
  const latest = new Date(Date.parse(turn.start) + QUESTION_SLACK_MS).toISOString();
  const asked = db.query("select createdAt from mastra_messages where thread_id = ? and role = 'user' and createdAt <= ? order by createdAt").all(turn.threadId, latest) as Question[];
  turn.position = Math.max(1, asked.length);
  turn.questionAt = asked.at(-1)?.createdAt ?? turn.start;
}

function positions(turns: Turn[]): void {
  const byPosition = new Map<number, Turn[]>();
  for (const turn of turns) byPosition.set(turn.position, [...(byPosition.get(turn.position) ?? []), turn]);
  console.log("\npositions: input tokens per chat call by the turn's position in its thread");
  console.log("  turn | turns | first call input p50 | first call uncached p50 | every call input p50 | calls per turn p50");
  for (const [position, group] of [...byPosition.entries()].sort(([a], [b]) => a - b)) {
    const first = group.map((turn) => turn.calls[0]).filter((call) => call !== undefined);
    const every = group.flatMap((turn) => turn.calls.map((call) => call.input));
    const row = [position, group.length, percentile(first.map((call) => call.input), 0.5), percentile(first.map((call) => call.input - call.cached), 0.5), percentile(every, 0.5), percentile(group.map((turn) => turn.calls.length), 0.5)];
    console.log(`  ${row.join(" | ")}`);
  }
}

function storedThrough(db: Database, threadId: string, questionAt: string): StoredMessageRow[] {
  return db.query("select id, role, content, createdAt, type, resourceId from mastra_messages where thread_id = ? and createdAt <= ? order by createdAt").all(threadId, questionAt) as StoredMessageRow[];
}

function emptyParts(): PartChars {
  return { question: 0, replyText: 0, reasoning: 0, signature: 0, toolCall: 0, toolResult: 0 };
}

function signatureChars(options: unknown): number {
  const details = (options as { openrouter?: { reasoning_details?: { data?: unknown }[] } } | undefined)?.openrouter?.reasoning_details ?? [];
  return details.reduce((sum, detail) => sum + (typeof detail.data === "string" ? detail.data.length : 0), 0);
}

function partChars(prompt: ModelPrompt): PartChars {
  const chars = emptyParts();
  for (const message of prompt) {
    if (message.role === "system") continue;
    for (const part of message.content) {
      if (part.type === "text") chars[message.role === "user" ? "question" : "replyText"] += part.text.length;
      if (part.type === "reasoning") chars.reasoning += part.text.length;
      if (part.type === "reasoning") chars.signature += signatureChars(part.providerOptions);
      if (part.type === "tool-call") chars.toolCall += part.toolName.length + JSON.stringify(part.input).length;
      if (part.type === "tool-result") chars.toolResult += JSON.stringify(part.output).length;
    }
  }
  return chars;
}

async function parts(db: Database, turns: Turn[]): Promise<void> {
  console.log("\nparts: history characters the first call of each later turn carries, against its uncached input tokens (history plus question)");
  console.log(`  thread | turn | uncached tokens | ${PARTS.join(" | ")} | estimated tokens | after HistoryTrim`);
  for (const turn of turns.filter((candidate) => candidate.position > 1).sort((a, b) => a.threadId.localeCompare(b.threadId) || a.position - b.position)) {
    const first = turn.calls[0];
    if (!first) continue;
    const prompt = await storedHistoryPrompt(turn.threadId, storedThrough(db, turn.threadId, turn.questionAt));
    const chars = partChars(prompt);
    const uncached = first.input - first.cached;
    const after = historyTokens(trimmedHistory(prompt));
    console.log(`  ${turn.threadId.slice(0, 8)} | ${turn.position} | ${uncached} | ${PARTS.map((part) => chars[part]).join(" | ")} | ${historyTokens(prompt)} | ${after}`);
  }
}

function longestThread(db: Database): string | null {
  const row = db.query("select thread_id id from mastra_messages group by thread_id order by sum(role = 'user') desc, sum(length(content)) desc limit 1").get() as { id: string } | null;
  return row?.id ?? null;
}

function tokensByPart(prompt: ModelPrompt): string {
  const chars = partChars(prompt);
  return PARTS.map((part) => `${part} ${Math.round(chars[part] / CHARS_PER_TOKEN[part])}`).join(" · ");
}

async function longest(db: Database): Promise<void> {
  const threadId = longestThread(db);
  if (!threadId) return;
  const rows = storedThrough(db, threadId, new Date().toISOString());
  const prompt = await storedHistoryPrompt(threadId, rows);
  const trimmed = trimmedHistory([...prompt, { role: "user", content: [{ type: "text", text: "" }] }]).slice(0, -1);
  console.log(`\nlongest: thread ${threadId}, ${rows.filter((row) => row.role === "user").length} questions, as the next call's history (estimated tokens; reasoning text is sent but not billed)`);
  console.log(`  before: ${historyTokens(prompt)} · ${tokensByPart(prompt)}`);
  console.log(`  after:  ${historyTokens(trimmed)} · ${tokensByPart(trimmed)}`);
}

if (process.argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}

const db = new Database(flag("mastra-db") ?? path.join(process.cwd(), ".data", "mastra.db"), { readonly: true });
const turns = tracedTurns(db);
positions(turns);
await parts(db, turns);
await longest(db);
