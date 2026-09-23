import type { AccessContext } from "@/lib/contracts";
import { visits, type Visit } from "@/lib/server/agent/collections";
import { openAlertsFor, relevanceOf } from "./alerts";

const SESSION_MS = 30 * 60_000;

export type Baseline = { at: string; alertIds: ReadonlySet<string> } | null;

function relevantAlertIds(access: AccessContext): string[] {
  return openAlertsFor(access)
    .filter((alert) => relevanceOf(alert, access) !== "other")
    .map((alert) => alert.id);
}

/**
 * Marks that the user is looking now and returns what they had seen at their previous visit;
 * reloads within half an hour count as the same visit, so "new" does not vanish on refresh.
 */
export function markVisit(access: AccessContext, now = Date.now()): Baseline {
  const store = visits();
  const stored = store.get(access.userId);
  const at = new Date(now).toISOString();
  const alertIds = relevantAlertIds(access);
  if (!stored) {
    store.put({ id: access.userId, at, alertIds, previousAt: null, previousAlertIds: null });
    return null;
  }
  const next: Visit =
    now - new Date(stored.at).getTime() > SESSION_MS
      ? { id: access.userId, at, alertIds, previousAt: stored.at, previousAlertIds: stored.alertIds }
      : { ...stored, alertIds: [...new Set([...stored.alertIds, ...alertIds])] };
  store.put(next);
  if (!next.previousAt || !next.previousAlertIds) return null;
  return { at: next.previousAt, alertIds: new Set(next.previousAlertIds) };
}
