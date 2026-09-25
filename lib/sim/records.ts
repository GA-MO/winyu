import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type StoredRecord = { id: string } & Record<string, unknown>;

export type Snapshot = Record<string, Record<string, StoredRecord>>;

/** Everything one run changed in the store: records it created, and the earlier copy of every record it changed. */
export type RunDiff = { created: Record<string, string[]>; modified: Record<string, Record<string, StoredRecord>> };

/** One simulated chat thread as it really ran, and the day it stands for. */
export type SessionWindow = { userId: string; threadId: string; daysAgo: number; startedAt: string; endedAt: string };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DAY_MS = 86_400_000;
const WINDOW_SLACK_MS = 15_000;
const USER_FIELDS = ["userId", "fromUserId", "toUserId"] as const;

/** Reads every collection in the data directory, keyed by record id. */
export function snapshotOf(dataDir: string): Snapshot {
  if (!existsSync(dataDir)) return {};
  const snapshot: Snapshot = {};
  for (const file of readdirSync(dataDir).filter((name) => name.endsWith(".json"))) {
    const rows = JSON.parse(readFileSync(path.join(dataDir, file), "utf8")) as unknown;
    if (!Array.isArray(rows)) continue;
    snapshot[file.slice(0, -".json".length)] = Object.fromEntries((rows as StoredRecord[]).filter((row) => typeof row?.id === "string").map((row) => [row.id, row]));
  }
  return snapshot;
}

/** What changed between two snapshots of the store. */
export function diffOf(before: Snapshot, after: Snapshot): RunDiff {
  const created: RunDiff["created"] = {};
  const modified: RunDiff["modified"] = {};
  for (const [collection, rows] of Object.entries(after)) {
    const earlier = before[collection] ?? {};
    for (const [id, row] of Object.entries(rows)) {
      const old = earlier[id];
      if (!old) (created[collection] ??= []).push(id);
      else if (JSON.stringify(old) !== JSON.stringify(row)) (modified[collection] ??= {})[id] = old;
    }
  }
  return { created, modified };
}

/** Moves every ISO instant inside a record by the same amount, so a record keeps its time of day on the day it stands for. */
export function shifted<T>(value: T, deltaMs: number): T {
  if (typeof value === "string") return (ISO_INSTANT.test(value) ? new Date(Date.parse(value) + deltaMs).toISOString() : value) as T;
  if (Array.isArray(value)) return value.map((item) => shifted(item, deltaMs)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shifted(inner, deltaMs)])) as T;
  return value;
}

function instantsOf(record: StoredRecord): number[] {
  return Object.values(record).filter((value): value is string => typeof value === "string" && ISO_INSTANT.test(value)).map((value) => Date.parse(value));
}

function within(window: SessionWindow, instant: number, slackMs = WINDOW_SLACK_MS): boolean {
  return instant >= Date.parse(window.startedAt) - slackMs && instant <= Date.parse(window.endedAt) + slackMs;
}

function rankOf(session: SessionWindow, instants: readonly number[], users: readonly string[]): number {
  const strict = instants.some((instant) => within(session, instant, 0)) ? 0 : 1;
  const actor = users.indexOf(session.userId);
  return strict * (USER_FIELDS.length + 1) + (actor === -1 ? USER_FIELDS.length : actor);
}

/** The session a record came from: its thread first, then a session running at that moment, preferring one that strictly contains it and the acting user (`userId`, then `fromUserId`) over the recipient. */
export function sessionOf(collection: string, record: StoredRecord, sessions: readonly SessionWindow[]): SessionWindow | null {
  const threadId = collection === "threads" ? record.id : typeof record.threadId === "string" ? record.threadId : null;
  const byThread = threadId ? sessions.find((session) => session.threadId === threadId) : undefined;
  if (byThread) return byThread;
  const instants = instantsOf(record);
  const users = USER_FIELDS.map((field) => record[field]).filter((value): value is string => typeof value === "string");
  const running = sessions.filter((session) => instants.some((instant) => within(session, instant)));
  return running.slice().sort((left, right) => rankOf(left, instants, users) - rankOf(right, instants, users))[0] ?? null;
}

/** How far a session's records move to land on the day it stands for. */
export function shiftFor(session: SessionWindow): number {
  return -session.daysAgo * DAY_MS;
}
