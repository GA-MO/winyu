import type { ContextPacket, Dim, MetricQuery } from "@/lib/contracts";
import type { AlertItem, EvidenceLine, HandoffItem, InboxPayload, ReplyItem } from "@/components/inbox/types";
import { requireAccess, unauthenticated } from "../_guard";
import { alerts, notifications, packets } from "@/lib/server/agent/collections";
import { openAlertsFor } from "@/lib/server/dashboard";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

const MAX_ITEMS = 20;

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function roleOf(userId: string): string {
  const user = findUser(userId);
  return user ? TH.role[user.role] : "";
}

function evidenceOf(query: MetricQuery): EvidenceLine {
  const filters = Object.entries(query.filters)
    .map(([dim, values]) => `${TH.dim[dim as Dim]}: ${(values ?? []).join(", ")}`)
    .join(" · ");
  const range = `${formatDateTh(query.range.from)} – ${formatDateTh(query.range.to)}`;
  return { label: metricLabel(query.metric), value: filters ? `${range} · ${filters}` : range };
}

function handoffOf(packet: ContextPacket): HandoffItem {
  return {
    id: packet.id,
    title: packet.title,
    ask: packet.ask,
    urgency: packet.urgency,
    sla: packet.sla,
    status: packet.status,
    fromName: nameOf(packet.fromUserId),
    fromRole: roleOf(packet.fromUserId),
    evidence: packet.evidence.map(evidenceOf),
    suggestedActions: [...packet.suggestedActions],
    digest: packet.conversationDigest,
    at: packet.createdAt,
    replies: packet.thread.map((reply) => ({ name: nameOf(reply.userId), at: reply.at, text: reply.text })),
  };
}

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();

  const handoffs: HandoffItem[] = packets()
    .where((packet) => packet.toUserId === access.userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_ITEMS)
    .map(handoffOf);

  const alertItems: AlertItem[] = openAlertsFor(access)
    .slice(0, MAX_ITEMS)
    .map((alert) => ({
      id: alert.id,
      severity: alert.severity,
      metric: metricLabel(alert.metric),
      hypothesis: alert.hypothesis,
      verifySteps: alert.verifySteps,
      at: alert.at,
      scope: Object.values(alert.dims).join(" · "),
    }));

  const replies: ReplyItem[] = packets()
    .where((packet) => packet.fromUserId === access.userId && packet.thread.length > 0)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_ITEMS)
    .map((packet) => {
      const last = packet.thread[packet.thread.length - 1];
      return { id: packet.id, title: packet.title, toName: nameOf(packet.toUserId), text: last.text, at: last.at, status: TH.inbox.status[packet.status] };
    });

  const unread = notifications().where((item) => item.userId === access.userId && !item.read).length;
  const payload: InboxPayload = { handoffs, alerts: alertItems, replies, unread };
  return Response.json(payload);
}
