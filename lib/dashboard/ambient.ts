import type { Alert, NextAction } from "@/lib/contracts";
import type { Spec, SpecElement } from "vexa/protocol";
import { TH } from "@/lib/i18n/th";
import { alertRowOf } from "@/lib/cards/alert-row";
import type { Tone } from "./metric-display";

export type AmbientPacket = { id: string; title: string; ask: string; fromName: string; urgency: "low" | "medium" | "high" };

export type AmbientInput = {
  alerts: readonly Alert[];
  packet: AmbientPacket | null;
  ownerName: (alert: Alert) => string | null;
  lessonOf: (alert: Alert) => string | null;
  actionsFor: (alert: Alert) => NextAction[];
};

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
  handoff: NextAction | null;
  spec: Spec;
};

/** One pinned card's headline on the landing: the number the dashboard shows, readable without opening it. */
export type LandingKpi = { id: string; label: string; value: string; delta: string | null; tone: Tone; detail: string | null; note: string | null };

/** One agent a field rep should visit today, with the one reason that put it on the list. */
export type VisitStop = { id: string; agent: string; reason: string; tone: AmbientTone; prompt: string };

export type StatusLink = { id: string; label: string; count: number; tone: AmbientTone; query: Record<string, string> };

const MAX_CARDS = 2;
const SEVERITIES: readonly Alert["severity"][] = ["P1", "P2", "P3"];
const SEVERITY_TONES: Record<Alert["severity"], "danger" | "warning" | "info"> = { P1: "danger", P2: "warning", P3: "info" };
const URGENCY_TONES: Record<AmbientPacket["urgency"], AmbientTone> = { high: "danger", medium: "warning", low: "info" };

function element(type: string, props: Record<string, unknown>, children: string[] = []): SpecElement {
  return { type, props, children } as SpecElement;
}

function signedGap(alert: Alert, gapLabel: string | null): string | null {
  if (!gapLabel) return null;
  return `${alert.direction === "down" ? "−" : "+"}${gapLabel}`;
}

function alertCard(alert: Alert, owner: string | null, lesson: string | null, actions: NextAction[]): AmbientCard {
  const row = alertRowOf(alert);
  const root = `ambient-alert-${alert.id}`;
  const tone = SEVERITY_TONES[alert.severity];
  const gap = signedGap(alert, row.gapLabel);
  const caption = TH.landing.observedVsExpected(row.observedLabel, row.expectedLabel);
  const eyebrow = `${row.severityLabel} · ${row.metricLabel}`;
  return {
    id: root,
    eyebrow,
    tone,
    title: row.scopeLabel,
    headline: gap ? { value: gap, tone, caption } : null,
    body: owner ? `${TH.inbox.owner(owner)} · ${row.hypothesis}` : row.hypothesis,
    lesson,
    prompt: TH.landing.askAbout(row.scopeLabel),
    packetId: null,
    alertId: alert.id,
    handoff: actions.find((action) => action.kind === "handoff" && action.tool !== null) ?? null,
    spec: {
      root,
      elements: { [root]: element("Alert", { title: row.scopeLabel, meta: gap ? `${gap} · ${caption}` : caption, body: row.hypothesis, tone }) },
    },
  };
}

function packetCard(packet: AmbientPacket): AmbientCard {
  const root = `ambient-packet-${packet.id}`;
  const eyebrow = `${TH.inbox.tabs.handoffs} · ${TH.inbox.urgency[packet.urgency]}`;
  const from = TH.landing.fromName(packet.fromName);
  return {
    id: root,
    eyebrow,
    tone: URGENCY_TONES[packet.urgency],
    title: packet.title,
    headline: null,
    body: `${from} · ${packet.ask}`,
    lesson: null,
    prompt: TH.landing.packetPrompt(packet.title),
    packetId: packet.id,
    alertId: null,
    handoff: null,
    spec: {
      root,
      elements: { [root]: element("Callout", { eyebrow, title: packet.title, body: packet.ask, tone: "brand" }) },
    },
  };
}

function differentStory(first: Alert, alerts: readonly Alert[]): Alert | null {
  const others = alerts.filter((alert) => alert.id !== first.id);
  const serious = others.filter((alert) => alert.severity !== "P3");
  const pool = serious.length > 0 ? serious : others;
  return pool.find((alert) => alert.dims.region !== first.dims.region || alert.metric !== first.metric) ?? pool[0] ?? null;
}

/** Up to two cards under the KPIs, each leading with the number that decides: the top alert, then the newest handoff or an alert from a different region or metric. */
export function ambientCards(input: AmbientInput): AmbientCard[] {
  const [first] = input.alerts;
  const cards: AmbientCard[] = [];
  if (first) cards.push(alertCard(first, input.ownerName(first), input.lessonOf(first), input.actionsFor(first)));
  const second = first ? differentStory(first, input.alerts) : null;
  if (input.packet) cards.push(packetCard(input.packet));
  else if (second) cards.push(alertCard(second, input.ownerName(second), input.lessonOf(second), input.actionsFor(second)));
  return cards.slice(0, MAX_CARDS);
}

/** The status line under the greeting: this user's alerts per severity, the rest of their scope, and waiting handoffs — each a link into the inbox. */
export function statusLinks(relevant: readonly Alert[], others: number, packets: number): StatusLink[] {
  const links: StatusLink[] = SEVERITIES.map((severity) => ({
    id: severity,
    label: TH.severity[severity],
    count: relevant.filter((alert) => alert.severity === severity).length,
    tone: SEVERITY_TONES[severity],
    query: { inbox: "alerts", severity },
  })).filter((link) => link.count > 0);
  if (packets > 0) links.push({ id: "handoffs", label: TH.inbox.tabs.handoffs, count: packets, tone: "brand", query: { inbox: "handoffs" } });
  if (others > 0) links.push({ id: "others", label: TH.landing.otherAlerts, count: others, tone: "neutral", query: { inbox: "alerts" } });
  return links;
}
