import type { AccessContext, Alert, User } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { USERS } from "@/lib/data/entities/users";
import { alertRowOf } from "@/lib/cards/alert-row";
import { TH } from "@/lib/i18n/th";
import { digests } from "./agent/collections";
import { ports } from "./ports";
import { openAlertsFor, openPacketsFor, relevanceOf } from "./alerts";
import { watchesOf } from "./watches";

const MAX_ALERT_LINES = 3;
const DIGEST_SEVERITIES: ReadonlySet<Alert["severity"]> = new Set(["P1", "P2"]);
const SYSTEM_SENDER = "cop";

export type Digest = { lines: string[]; count: number; alertIds: string[] };

function alertLine(alert: Alert): string {
  const row = alertRowOf(alert);
  const gap = row.gapLabel ? ` ${alert.direction === "down" ? "−" : "+"}${row.gapLabel}` : "";
  return `${row.severityLabel} · ${row.metricLabel} ${row.scopeLabel}${gap}`;
}

/** What one user should hear this morning: their own serious alerts that are new since the last digest, handoffs waiting, watches over the line; empty when there is nothing. */
export function digestFor(access: AccessContext, alreadySent: ReadonlySet<string>): Digest {
  const serious = openAlertsFor(access).filter((alert) => DIGEST_SEVERITIES.has(alert.severity) && relevanceOf(alert, access) !== "other");
  const fresh = serious.filter((alert) => !alreadySent.has(alert.id));
  const packets = openPacketsFor(access);
  const triggered = watchesOf(access.userId).filter((watch) => watch.state === "triggered");
  const lines: string[] = fresh.slice(0, MAX_ALERT_LINES).map(alertLine);
  if (fresh.length > MAX_ALERT_LINES) lines.push(TH.digest.moreAlerts(fresh.length - MAX_ALERT_LINES));
  if (packets.length > 0) lines.push(TH.digest.packets(packets.length));
  for (const watch of triggered) lines.push(TH.digest.watch(watch.title));
  const count = fresh.length + packets.length + triggered.length;
  return { lines, count, alertIds: serious.map((alert) => alert.id) };
}

async function send(user: User, digest: Digest): Promise<void> {
  await ports().mail.send({
    kind: "digest",
    fromUserId: SYSTEM_SENDER,
    toUserId: user.id,
    toEmail: user.email,
    subject: TH.digest.subject(digest.count),
    body: [...digest.lines.map((line) => `• ${line}`), "", TH.digest.footer].join("\n"),
    refId: null,
  });
}

/** Once a day per user, and only to users who have something to hear; the alerts it mentions are not repeated tomorrow. */
export async function runDigestJob(at = new Date()): Promise<{ sent: number; skipped: number }> {
  const day = at.toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  for (const user of USERS) {
    const previous = digests().get(user.id);
    if (previous?.day === day) {
      skipped += 1;
      continue;
    }
    const digest = digestFor(liveAccessFor(user), new Set(previous?.alertIds ?? []));
    if (digest.lines.length === 0) {
      skipped += 1;
      continue;
    }
    await send(user, digest);
    digests().put({ id: user.id, day, alertIds: digest.alertIds });
    sent += 1;
  }
  return { sent, skipped };
}
