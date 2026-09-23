import type { AuditEntry } from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
import { actionEvents, packets } from "@/lib/server/agent/collections";
import { threads } from "@/lib/server/threads-read";
import { turnsOf } from "@/lib/server/threads";
import { models } from "@/lib/server/models";

const DAYS = 14;
const TOP_INTENTS = 8;
const UNANSWERED_LIMIT = 8;
const CHARS_PER_TOKEN = 3;
const PER_MILLION = 1_000_000;

type Rate = { input: number; output: number };

const RATES: Record<string, Rate> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "google/gemini-3.8-flash": { input: 0.75, output: 3.75 },
};

const FREE: Rate = { input: 0, output: 0 };

export type UsagePoint = { day: string; count: number };
export type IntentCount = { intentKey: string; count: number };
export type UnansweredQuestion = { prompt: string; at: string; userId: string };

export type UsageSummary = {
  modelId: string;
  questions: number;
  perDay: UsagePoint[];
  topIntents: IntentCount[];
  unanswered: UnansweredQuestion[];
  toolCalls: number;
  denied: number;
  masked: number;
  emptyResults: number;
  packets: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function lastDays(count: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let back = count - 1; back >= 0; back -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - back);
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

function tokensOf(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function defaultModelId(): string {
  return Object.keys(models())[0] ?? "";
}

function rateOf(modelId: string): Rate {
  return RATES[modelId] ?? FREE;
}

function countsPerDay(stamps: string[]): UsagePoint[] {
  const table = new Map(lastDays(DAYS).map((day) => [day, 0]));
  for (const stamp of stamps) {
    const day = dayOf(stamp);
    if (table.has(day)) table.set(day, (table.get(day) ?? 0) + 1);
  }
  return [...table].map(([day, count]) => ({ day, count }));
}

function rank(keys: string[]): IntentCount[] {
  const table = new Map<string, number>();
  for (const key of keys) table.set(key, (table.get(key) ?? 0) + 1);
  return [...table]
    .map(([intentKey, count]) => ({ intentKey, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, TOP_INTENTS);
}

function decisionCount(entries: AuditEntry[], decision: AuditEntry["decision"]): number {
  return entries.filter((entry) => entry.decision === decision).length;
}

/** What the platform did this fortnight: questions asked, intents behind them, what it could not answer and what it cost. */
export function usageSummary(): UsageSummary {
  const entries = auditLog().all();
  const events = actionEvents().all();
  const questions = events.filter((event) => event.kind === "question" || event.kind === "quick_action");
  const unanswered: UnansweredQuestion[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const thread of threads().all()) {
    for (const turn of turnsOf(thread.messages)) {
      inputTokens += tokensOf(turn.prompt);
      outputTokens += tokensOf(turn.answer);
      if (turn.metric === null) unanswered.push({ prompt: turn.prompt, at: thread.updatedAt, userId: thread.userId });
    }
  }

  const modelId = defaultModelId();
  const rate = rateOf(modelId);
  return {
    modelId,
    questions: questions.length,
    perDay: countsPerDay(questions.map((event) => event.at)),
    topIntents: rank(questions.map((event) => event.intentKey).filter((key) => key.length > 0)),
    unanswered: unanswered.sort((left, right) => right.at.localeCompare(left.at)).slice(0, UNANSWERED_LIMIT),
    toolCalls: entries.length,
    denied: decisionCount(entries, "deny"),
    masked: decisionCount(entries, "masked"),
    emptyResults: entries.filter((entry) => entry.decision === "allow" && entry.rowsReturned === 0).length,
    packets: packets().all().length,
    inputTokens,
    outputTokens,
    costUsd: (inputTokens * rate.input + outputTokens * rate.output) / PER_MILLION,
  };
}

export type AuditFilter = { userId: string | null; tool: string | null; decision: AuditEntry["decision"] | null };

/** The audit trail newest first, narrowed by the console's filters. */
export function auditEntries(filter: AuditFilter, limit: number): AuditEntry[] {
  return auditLog()
    .all()
    .filter((entry) => !filter.userId || entry.userId === filter.userId)
    .filter((entry) => !filter.tool || entry.tool === filter.tool)
    .filter((entry) => !filter.decision || entry.decision === filter.decision)
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, limit);
}
