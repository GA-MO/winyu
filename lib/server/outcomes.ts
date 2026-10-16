import { randomUUID } from "node:crypto";
import type { Alert } from "@/lib/contracts";
import { thresholdKey } from "@/lib/engine/anomaly";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { alertOutcomes, alerts, type AlertOutcome } from "./agent/collections";
import { dismissAlert } from "./alerts";
import type { Verdict } from "@/lib/share/matter";

/**
 * What closing a matter about alerts teaches: every alert it carried is labelled real or noise with what was done;
 * noise closes the alert for everyone and counts toward raising the bar, real marks it resolved.
 */
export function recordOutcome(alertIds: readonly string[], byUserId: string, verdict: Verdict, outcome: string, at = new Date()): AlertOutcome[] {
  const saved: AlertOutcome[] = [];
  for (const alertId of alertIds) {
    const alert = alerts().get(alertId);
    if (!alert) continue;
    saved.push(
      alertOutcomes().put({ id: randomUUID(), key: thresholdKey(alert.metric, alert.dims), alertId, verdict, outcome, byUserId, at: at.toISOString() }),
    );
    if (verdict === "noise") dismissAlert(alert);
    else alerts().put({ ...alert, status: "resolved" });
  }
  return saved;
}

/** The last time this slice was handled — who, when, whether it was real, what they did — shown whenever an alert on the slice is open again. */
export function lessonFor(alert: Alert): string | null {
  const key = thresholdKey(alert.metric, alert.dims);
  const last = alertOutcomes()
    .where((entry) => entry.key === key)
    .sort((left, right) => right.at.localeCompare(left.at))[0];
  if (!last) return null;
  const name = findUser(last.byUserId)?.nameTh ?? last.byUserId;
  return TH.lesson.line(TH.lesson.verdict[last.verdict], last.outcome, name, formatDateTh(last.at));
}
