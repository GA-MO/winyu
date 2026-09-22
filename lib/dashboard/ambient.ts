import type { Alert } from "@/lib/contracts";
import type { Spec, SpecElement } from "vexa/protocol";
import { TH } from "@/lib/i18n/th";
import { metricLabel } from "./metric-display";

export type AmbientPacket = { id: string; title: string; ask: string; fromName: string; urgency: "low" | "medium" | "high" };

export type AmbientCounts = { alerts: number; packets: number; widgets: number };

export type AmbientInput = { alert: Alert | null; packet: AmbientPacket | null; brief: string; counts: AmbientCounts };

export type AmbientTone = "danger" | "warning" | "info" | "brand";

export type AmbientCard = { id: string; label: string; title: string; body: string; tone: AmbientTone; prompt: string; spec: Spec };

const MAX_CARDS = 3;
const SEVERITY_TONES: Record<Alert["severity"], "danger" | "warning" | "info"> = { P1: "danger", P2: "warning", P3: "info" };

function element(type: string, props: Record<string, unknown>, children: string[] = []): SpecElement {
  return { type, props, children } as SpecElement;
}

function alertCard(alert: Alert): AmbientCard {
  const root = `ambient-alert-${alert.id}`;
  const title = `${TH.severity[alert.severity]} · ${metricLabel(alert.metric)}`;
  return {
    id: root,
    label: TH.inbox.tabs.alerts,
    title,
    body: alert.hypothesis,
    tone: SEVERITY_TONES[alert.severity],
    prompt: alert.verifySteps[0],
    spec: {
      root,
      elements: {
        [root]: element("Alert", {
          title,
          body: alert.hypothesis,
          tone: SEVERITY_TONES[alert.severity],
        }),
      },
    },
  };
}

function packetCard(packet: AmbientPacket): AmbientCard {
  const root = `ambient-packet-${packet.id}`;
  return {
    id: root,
    label: TH.inbox.tabs.handoffs,
    title: packet.title,
    body: packet.ask,
    tone: "brand",
    prompt: `สรุปงานที่ส่งต่อมาเรื่อง ${packet.title} และบอกว่าควรเริ่มตรวจอะไรก่อน`,
    spec: {
      root,
      elements: {
        [root]: element("Callout", {
          eyebrow: TH.inbox.from(packet.fromName, TH.inbox.urgency[packet.urgency]),
          title: packet.title,
          body: packet.ask,
          tone: "brand",
        }),
      },
    },
  };
}

function briefCard(counts: AmbientCounts): AmbientCard {
  const root = "ambient-brief";
  const body = `การ์ดที่ปักไว้ ${counts.widgets} · แจ้งเตือนที่เปิดอยู่ ${counts.alerts} · งานที่ส่งต่อมา ${counts.packets}`;
  const title = "ภาพรวมของคุณวันนี้";
  return {
    id: root,
    label: TH.landing.ambient,
    title,
    body,
    tone: "info",
    prompt: "สรุปภาพรวมวันนี้ให้หน่อย พร้อมบอกว่าควรดูอะไรก่อน",
    spec: {
      root,
      elements: {
        [root]: element("Callout", { eyebrow: TH.landing.ambient, title, body, tone: "info" }),
      },
    },
  };
}

/** Up to three cards the landing shows under the composer: top open alert, newest handoff, the day's counts. */
export function ambientCards(input: AmbientInput): AmbientCard[] {
  const cards: AmbientCard[] = [];
  if (input.alert) cards.push(alertCard(input.alert));
  if (input.packet) cards.push(packetCard(input.packet));
  cards.push(briefCard(input.counts));
  return cards.slice(0, MAX_CARDS);
}
