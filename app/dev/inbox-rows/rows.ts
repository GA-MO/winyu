import type { FeedItem, FeedTone } from "@/lib/contracts";
import type { AlertItem, HandoffItem } from "@/components/inbox/types";
import { TH } from "@/lib/i18n/th";

export type Severity = AlertItem["severity"];
export type Tone = AlertItem["movement"]["tone"];
export type Figure = { value: string; expected: string | null; delta: string | null; tone: Tone };

export type AlertRow = { id: string; severity: Severity; subject: string; metric: string; figure: Figure; owner: string; action: string; reason: string; window: string; at: string; menu: string[] };
export type AlertFold = { urgent: AlertRow[]; rest: AlertRow[]; restCounts: { severity: Severity; count: number }[] };
export type TodoRow = { key: string; title: string; figure: string; tone: FeedTone; detail: string | null; action: string | null };

export type HandoffPrimary = "accept" | "close";
export type HandoffRow = {
  id: string;
  title: string;
  ask: string;
  from: string;
  fromRole: string;
  urgent: boolean;
  due: string | null;
  figure: Figure | null;
  evidence: string | null;
  primary: HandoffPrimary | null;
  menu: string[];
};

const URGENT: Severity = "P1";
const FOLDED: readonly Severity[] = ["P2", "P3"];
const PERCENT = 100;
const MAX_GAP_RATIO = 2;
const HANDOFF_PRIMARY: Record<HandoffItem["status"], HandoffPrimary | null> = { open: "accept", need_info: "accept", returned: null, accepted: "close", resolved: null };

/** "คุณวีร์ เจริญสุข" becomes "คุณวีร์": the name a row has room for. */
export function shortName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

export function alertRowOf(item: AlertItem): AlertRow {
  const owner = shortName(item.ownerName);
  return {
    id: item.id,
    severity: item.severity,
    subject: item.scope || item.metric,
    metric: item.metric,
    figure: { value: item.movement.observed, expected: item.movement.expected, delta: item.movement.delta, tone: item.movement.tone },
    owner,
    action: item.handoffPrompt && owner ? TH.feed.sendTo(owner) : TH.inboxRows.checkInChat,
    reason: item.hypothesis,
    window: item.window,
    at: item.at,
    menu: item.canJudge ? [TH.inbox.mute, TH.inbox.dismiss] : [TH.inbox.mute],
  };
}

/** P1 stays on screen; P2 and P3 fold into one line that says how many of each wait underneath. */
export function foldAlerts(items: AlertItem[]): AlertFold {
  const rows = items.map(alertRowOf);
  const rest = rows.filter((row) => row.severity !== URGENT);
  return {
    urgent: rows.filter((row) => row.severity === URGENT),
    rest,
    restCounts: FOLDED.map((severity) => ({ severity, count: rest.filter((row) => row.severity === severity).length })).filter((entry) => entry.count > 0),
  };
}

export function todoRowOf(item: FeedItem): TodoRow {
  return { key: item.key, title: item.label, figure: item.reason, tone: item.tone, detail: item.detail, action: item.actions[0]?.label ?? null };
}

function linkedAlert(handoff: HandoffItem, alerts: AlertItem[]): AlertItem | null {
  return alerts.find((alert) => alert.scope && handoff.title.startsWith(alert.scope.split(" · ")[0])) ?? null;
}

/** The handoff as a row; its number comes from the alert it was raised on, matched by the subject its title opens with. */
export function handoffRowOf(item: HandoffItem, alerts: AlertItem[], status: HandoffItem["status"] = item.status): HandoffRow {
  const alert = linkedAlert(item, alerts);
  return {
    id: item.id,
    title: item.title,
    ask: item.ask,
    from: item.fromName,
    fromRole: item.fromRole,
    urgent: item.urgency === "high",
    due: item.sla,
    figure: alert ? { value: alert.movement.observed, expected: alert.movement.expected, delta: alert.movement.delta, tone: alert.movement.tone } : null,
    evidence: item.evidence[0]?.label ?? null,
    primary: HANDOFF_PRIMARY[status],
    menu: status === "accepted" ? [TH.inbox.needInfo, TH.inbox.reject] : [TH.inbox.needInfo, TH.inbox.reject, TH.inbox.openInAgent],
  };
}

/** How long the observed bar is against an expected bar of 1, read from a delta like "-61.1%"; null when there is no delta. */
export function gapRatio(delta: string | null): number | null {
  if (!delta) return null;
  const percent = Number.parseFloat(delta.replace("−", "-").replace(/[^\d.+-]/g, ""));
  if (Number.isNaN(percent)) return null;
  return Math.min(MAX_GAP_RATIO, Math.max(0, 1 + percent / PERCENT));
}

/** Everything one direction draws: the same rows for all three columns. */
export type Specimens = {
  ceo: string;
  rep: string;
  todo: TodoRow[];
  alerts: AlertFold;
  alertCount: number;
  opened: AlertRow | null;
  handoff: HandoffRow | null;
  accepted: HandoffRow | null;
};
