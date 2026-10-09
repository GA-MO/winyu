import type { Alert, AlertRow, FeedItem, NextAction } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { Tone } from "./metric-display";

/** A handoff waiting for the viewer; `carried` is the open alert it is about, whose number leads its card. */
export type AmbientPacket = { id: string; title: string; ask: string; fromName: string; urgency: "low" | "medium" | "high"; carried: Alert | null };

export type AmbientTone = "danger" | "warning" | "info" | "brand" | "success" | "neutral";

export type AmbientHeadline = { value: string; tone: AmbientTone; caption: string | null };

export type AmbientCard = {
  id: string;
  eyebrow: string;
  tone: AmbientTone;
  title: string;
  headline: AmbientHeadline | null;
  body: string | null;
  lesson: string | null;
  prompt: string;
  packetId: string | null;
  alertId: string | null;
  /** The feed item this card stands for, which its done/snooze/not-mine menu acts on; null for a handoff, which closes in the inbox. */
  feedKey: string | null;
  /** The one thing the card offers to do, decided by rules; it runs through the approval card. */
  action: NextAction | null;
};

/** One pinned card's headline on the landing: the number the dashboard shows, readable without opening it. */
export type LandingKpi = { id: string; label: string; value: string; delta: string | null; tone: Tone; detail: string | null; note: string | null; period?: string };

/** One agent a field rep should visit today, with the one reason that put it on the list. */
export type VisitStop = { id: string; agent: string; reason: string; tone: AmbientTone; prompt: string };

/** What an alert's card needs besides the alert: its display row, whose it is when not the viewer's, the line under it, and what it offers to do. */
export type AlertCardParts = { alert: Alert; row: AlertRow; owner: string | null; note: string | null; actions: readonly NextAction[] };

const SEVERITY_TONES: Record<Alert["severity"], "danger" | "warning" | "info"> = { P1: "danger", P2: "warning", P3: "info" };
const URGENCY_TONES: Record<AmbientPacket["urgency"], AmbientTone> = { high: "danger", medium: "warning", low: "info" };
const TONE_SEVERITY: Partial<Record<AmbientTone, string>> = { danger: TH.severity.P1, warning: TH.severity.P2 };

function signedGap(alert: Alert, gapLabel: string | null): string | null {
  if (!gapLabel) return null;
  return `${alert.direction === "down" ? "−" : "+"}${gapLabel}`;
}

function headlineOf(row: AlertRow, alert: Alert): AmbientHeadline | null {
  const gap = signedGap(alert, row.gapLabel);
  return gap ? { value: gap, tone: SEVERITY_TONES[alert.severity], caption: TH.landing.observedVsExpected(row.observedLabel, row.expectedLabel) } : null;
}

function actionOf(actions: readonly NextAction[]): NextAction | null {
  return actions.find((action) => action.tool !== null) ?? null;
}

/** An alert's card: the gap against expected leads, then where it is, the hypothesis, and the note under it. */
export function alertCard({ alert, row, owner, note, actions }: AlertCardParts): AmbientCard {
  const root = `ambient-alert-${alert.id}`;
  const tone = SEVERITY_TONES[alert.severity];
  return {
    id: root,
    eyebrow: `${row.severityLabel} · ${row.metricLabel}`,
    tone,
    title: row.scopeLabel,
    headline: headlineOf(row, alert),
    body: owner ? `${TH.inbox.owner(owner)} · ${row.hypothesis}` : row.hypothesis,
    lesson: note,
    prompt: TH.landing.askAbout(row.scopeLabel),
    packetId: null,
    alertId: alert.id,
    feedKey: `alert:${alert.id}`,
    action: actionOf(actions),
  };
}

/** A handoff's card; when it carries an alert, that alert's number leads. */
export function packetCard(packet: AmbientPacket, row: AlertRow | null): AmbientCard {
  const root = `ambient-packet-${packet.id}`;
  const eyebrow = `${TH.inbox.sections.handoffs} · ${TH.inbox.urgency[packet.urgency]}`;
  return {
    id: root,
    eyebrow,
    tone: URGENCY_TONES[packet.urgency],
    title: packet.title,
    headline: row && packet.carried ? headlineOf(row, packet.carried) : null,
    body: `${TH.landing.fromName(packet.fromName)} · ${packet.ask}`,
    lesson: null,
    prompt: TH.landing.packetPrompt(packet.title),
    packetId: packet.id,
    alertId: null,
    feedKey: null,
    action: null,
  };
}

function kindLabel(item: FeedItem): string {
  return TH.feed.kinds[item.kind] ?? TH.feed.sources[item.source];
}

/** Any other matter on the feed as a card: what it is about, the reason it is there as the headline, and its detail. */
export function itemCard(item: FeedItem): AmbientCard {
  const root = `ambient-item-${item.key}`;
  const severity = TONE_SEVERITY[item.tone];
  const eyebrow = severity ? `${severity} · ${kindLabel(item)}` : kindLabel(item);
  return {
    id: root,
    eyebrow,
    tone: item.tone,
    title: item.label,
    headline: { value: item.reason, tone: item.tone, caption: null },
    body: item.detail,
    lesson: item.because,
    prompt: item.prompt,
    packetId: item.packetId,
    alertId: null,
    feedKey: item.key,
    action: actionOf(item.actions),
  };
}
