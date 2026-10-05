import type { AuditEntry } from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
import { actionEvents, packets } from "@/lib/server/agent/collections";
import { threads } from "@/lib/server/threads-read";
import { turnsOf } from "@/lib/server/threads";
import { agentModel } from "@/lib/server/models";
import { modelSpend, type ModelSpend } from "@/lib/server/model-ledger";
import { surfaceEntry } from "@/lib/server/tools/registry";

const DAYS = 14;
const TOP_INTENTS = 8;
const UNANSWERED_LIMIT = 8;

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
  spend: ModelSpend;
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

function defaultModelId(): string {
  return agentModel()?.id ?? "";
}

function sinceDaysAgo(days: number): string {
  return `${lastDays(days)[0]}T00:00:00.000Z`;
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

  for (const thread of threads().all()) {
    for (const turn of turnsOf(thread.messages)) {
      if (turn.metric === null) unanswered.push({ prompt: turn.prompt, at: thread.updatedAt, userId: thread.userId });
    }
  }

  const modelId = defaultModelId();
  const spend = modelSpend(sinceDaysAgo(DAYS));
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
    inputTokens: spend.inputTokens,
    outputTokens: spend.outputTokens,
    costUsd: spend.totalUsd,
    spend,
  };
}

export type AuditFilter = { userId: string | null; tool: string | null; connector: string | null; decision: AuditEntry["decision"] | null; since: string | null };

export const AUDIT_RANGES = ["today", "7d", "30d", "all"] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number];
const RANGE_DAYS: Record<AuditRange, number | null> = { today: 0, "7d": 7, "30d": 30, all: null };

/** The first instant an audit range covers, in UTC ISO; null for all time. */
export function sinceOf(range: AuditRange, now = Date.now()): string | null {
  const days = RANGE_DAYS[range];
  if (days === null) return null;
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return new Date(start.getTime() - days * 24 * 60 * 60_000).toISOString();
}

/** The connector an audit row went through; rows written before connectors were recorded fall back to the tool's connector today. */
export function auditConnector(entry: AuditEntry): string | null {
  return entry.connector ?? surfaceEntry(entry.tool)?.connector ?? null;
}

/** Whether an audit row matches the admin's user, tool and connector filter, before the decision is picked. */
export function inAuditScope(entry: AuditEntry, filter: AuditFilter): boolean {
  if (filter.userId && entry.userId !== filter.userId) return false;
  if (filter.tool && entry.tool !== filter.tool) return false;
  if (filter.since && entry.at < filter.since) return false;
  return !filter.connector || auditConnector(entry) === filter.connector;
}

/** The audit trail newest first, narrowed by the console's filters. */
export function auditEntries(filter: AuditFilter, limit: number): AuditEntry[] {
  return auditLog()
    .all()
    .filter((entry) => inAuditScope(entry, filter))
    .filter((entry) => !filter.decision || entry.decision === filter.decision)
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, limit);
}

export type ToolActivity = { calls: number; failed: number };

/** How often each tool was called since a moment, and how many of those calls were refused or failed. */
export function toolActivity(since: string | null): Map<string, ToolActivity> {
  const table = new Map<string, ToolActivity>();
  for (const entry of auditLog().all()) {
    if (since && entry.at < since) continue;
    const row = table.get(entry.tool) ?? { calls: 0, failed: 0 };
    row.calls += 1;
    if (entry.decision === "deny" || entry.code) row.failed += 1;
    table.set(entry.tool, row);
  }
  return table;
}
