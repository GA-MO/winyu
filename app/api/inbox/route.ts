import type { AccessContext, Alert, ContextPacket, Dim } from "@/lib/contracts";
import type { AlertItem, EvidenceLine, HandoffItem, InboxPayload, ReplyItem } from "@/components/inbox/types";
import { requireAccess, unauthenticated } from "../_guard";
import { notifications } from "@/lib/server/agent/collections";
import { packetsFor, resolveEvidence, sentPackets, type EvidenceView } from "@/lib/server/handoff";
import { openAlertsFor } from "@/lib/server/alerts";
import { displayLabel } from "@/lib/semantic/dictionary";
import { formatDelta, formatMetricValue, metricLabel, toneOf } from "@/lib/dashboard/metric-display";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

const MAX_ITEMS = 20;
const MAX_ALERT_ITEMS = 60;

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function roleOf(userId: string): string {
  const user = findUser(userId);
  return user ? TH.role[user.role] : "";
}

function evidenceOf(view: EvidenceView): EvidenceLine {
  return {
    label: view.metric,
    value: view.scope ? `${view.range} · ${view.scope}` : view.range,
    summary: view.denied ? TH.handoff.denied : view.summary,
    masked: view.masked,
    denied: view.denied,
    requestPrompt: view.masked || view.denied ? TH.handoff.requestPrompt(view.metric, view.ownerUserId ?? "") : null,
  };
}

const PERCENT = 100;
const SCOPE_ORDER: Dim[] = ["agent", "dc", "plant", "sku", "brand", "channel", "province", "region"];

function scopeOf(alert: Alert): string {
  const shown = SCOPE_ORDER.filter((dim) => alert.dims[dim] && !(dim === "brand" && alert.dims.sku) && !(dim === "region" && Object.keys(alert.dims).length > 1));
  return shown.map((dim) => displayLabel(dim, alert.dims[dim] as string)).join(" · ");
}

function movementOf(alert: Alert): AlertItem["movement"] {
  const delta = alert.expected === 0 ? null : ((alert.observed - alert.expected) / Math.abs(alert.expected)) * PERCENT;
  return {
    observed: formatMetricValue(alert.metric, alert.observed),
    expected: formatMetricValue(alert.metric, alert.expected),
    delta: formatDelta(delta),
    tone: toneOf(alert.metric, delta),
  };
}

function alertOf(alert: Alert): AlertItem {
  const owner = findUser(alert.ownerUserId);
  const scope = scopeOf(alert);
  return {
    id: alert.id,
    severity: alert.severity,
    metric: metricLabel(alert.metric),
    hypothesis: alert.hypothesis,
    verifySteps: alert.verifySteps,
    at: alert.at,
    scope,
    window: `${formatDateTh(alert.window.from)} – ${formatDateTh(alert.window.to)}`,
    movement: movementOf(alert),
    ownerName: owner?.nameTh ?? "",
    handoffPrompt: TH.inbox.handoffPrompt(metricLabel(alert.metric), scope, owner?.nameTh ?? ""),
  };
}

function handoffOf(packet: ContextPacket, access: AccessContext): HandoffItem {
  return {
    id: packet.id,
    title: packet.title,
    ask: packet.ask,
    urgency: packet.urgency,
    sla: packet.sla,
    status: packet.status,
    fromName: nameOf(packet.fromUserId),
    fromRole: roleOf(packet.fromUserId),
    evidence: resolveEvidence(packet, access).map(evidenceOf),
    suggestedActions: [...packet.suggestedActions],
    digest: packet.conversationDigest,
    at: packet.createdAt,
    outcome: packet.outcome,
    replies: packet.thread.map((reply) => ({ name: nameOf(reply.userId), at: reply.at, text: reply.text })),
  };
}

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();

  const handoffs: HandoffItem[] = packetsFor(access.userId)
    .slice(0, MAX_ITEMS)
    .map((packet) => handoffOf(packet, access));

  const alertItems: AlertItem[] = openAlertsFor(access).slice(0, MAX_ALERT_ITEMS).map(alertOf);

  const replies: ReplyItem[] = sentPackets(access.userId)
    .filter((packet) => packet.thread.length > 0)
    .slice(0, MAX_ITEMS)
    .map((packet) => {
      const last = packet.thread[packet.thread.length - 1];
      return { id: packet.id, title: packet.title, toName: nameOf(packet.toUserId), text: last.text, at: last.at, status: TH.inbox.status[packet.status] };
    });

  const unread = notifications().where((item) => item.userId === access.userId && !item.read).length;
  const payload: InboxPayload = { handoffs, alerts: alertItems, replies, unread };
  return Response.json(payload);
}
