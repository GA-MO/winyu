import type { AuditEntry } from "@/lib/contracts";
import { isActivity } from "@/lib/server/activity";
import { auditLog } from "@/lib/server/audit";
import { actionEvents } from "@/lib/server/agent/collections";
import { shares } from "@/lib/server/share/shares";
import { agentModel } from "@/lib/server/models";
import { modelSpend, type ModelSpend } from "@/lib/server/model-ledger";
import { sinceDaysStart, toolCalls } from "@/lib/server/tool-activity";
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
  matters: number;
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
  const entries = toolCalls(auditLog().all());
  const events = actionEvents().all();
  const questions = events.filter((event) => event.kind === "question" || event.kind === "quick_action");
  const unanswered: UnansweredQuestion[] = events
    .filter((event) => event.kind === "question" && event.metric === null && event.prompt)
    .map((event) => ({ prompt: event.prompt ?? "", at: event.at, userId: event.userId }));

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
    matters: shares().all().length,
    inputTokens: spend.inputTokens,
    outputTokens: spend.outputTokens,
    costUsd: spend.totalUsd,
    spend,
  };
}

/** The console's audit filters; `activity` keeps only the steps that acted (sends, presses on a matter, writes that ran). */
export type AuditFilter = { userId: string | null; tool: string | null; connector: string | null; decision: AuditEntry["decision"] | null; since: string | null; activity: boolean };

/** The `kind` the console's audit URL carries for the activity filter. */
export const AUDIT_ACTIVITY_KIND = "activity";

export const AUDIT_RANGES = ["today", "7d", "30d", "all"] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number];
const RANGE_DAYS: Record<AuditRange, number | null> = { today: 0, "7d": 7, "30d": 30, all: null };

/** The first instant an audit range covers, in UTC ISO; null for all time. */
export function sinceOf(range: AuditRange, now = Date.now()): string | null {
  const days = RANGE_DAYS[range];
  return days === null ? null : sinceDaysStart(days, now);
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
  if (filter.activity && !isActivity(entry)) return false;
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
