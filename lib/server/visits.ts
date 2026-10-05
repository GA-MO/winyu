import type { AccessContext } from "@/lib/contracts";
import { visits, type Visit } from "@/lib/server/agent/collections";
import { relevantAlertsFor } from "./alerts";

const SESSION_MS = 30 * 60_000;

export type Baseline = { at: string; alertIds: ReadonlySet<string> } | null;

function relevantAlertIds(access: AccessContext): string[] {
  return relevantAlertsFor(access).map((alert) => alert.id);
}

/** How many visits each feed item has been shown in: once per visit, however often the page reloads within it. */
function countSeen(counts: Readonly<Record<string, number>>, alreadyShown: readonly string[], shownKeys: readonly string[]): Record<string, number> {
  const next = { ...counts };
  const counted = new Set(alreadyShown);
  for (const key of shownKeys) {
    if (counted.has(key)) continue;
    counted.add(key);
    next[key] = (next[key] ?? 0) + 1;
  }
  return next;
}

/**
 * Marks that the user is looking now and returns what they had seen at their previous visit;
 * reloads within half an hour count as the same visit, so "new" does not vanish on refresh.
 */
export function markVisit(access: AccessContext, shownKeys: readonly string[] = [], now = Date.now()): Baseline {
  const store = visits();
  const stored = store.get(access.userId);
  const at = new Date(now).toISOString();
  const alertIds = relevantAlertIds(access);
  if (!stored) {
    store.put({ id: access.userId, at, alertIds, previousAt: null, previousAlertIds: null, shownKeys: [...shownKeys], seenCounts: countSeen({}, [], shownKeys) });
    return null;
  }
  const newSession = now - new Date(stored.at).getTime() > SESSION_MS;
  const alreadyShown = newSession ? [] : (stored.shownKeys ?? []);
  const seen = { shownKeys: [...new Set([...alreadyShown, ...shownKeys])], seenCounts: countSeen(stored.seenCounts ?? {}, alreadyShown, shownKeys) };
  const next: Visit = newSession
    ? { id: access.userId, at, alertIds, previousAt: stored.at, previousAlertIds: stored.alertIds, ...seen }
    : { ...stored, alertIds: [...new Set([...stored.alertIds, ...alertIds])], ...seen };
  store.put(next);
  if (!next.previousAt || !next.previousAlertIds) return null;
  return { at: next.previousAt, alertIds: new Set(next.previousAlertIds) };
}
