import { randomUUID } from "node:crypto";
import type { AccessContext, ContextPacket, Dim, MetricQuery, MetricRow, Notification, PacketReply, User } from "@/lib/contracts";
import { runMetric } from "@/lib/data/query";
import { responsibleFor } from "@/lib/access/raci";
import { findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { displayLabel } from "@/lib/semantic/dictionary";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { notifications, outbox, packetOrigins, packets, type OutboxEntry } from "./agent/collections";
import { threads } from "./threads-read";
import { rememberAction } from "@/lib/engine/memory";

const MAX_EVIDENCE_ROWS = 6;
const DIGEST_TURNS = 3;
const DIGEST_CHARS = 180;
const SLA_HOURS: Record<ContextPacket["urgency"], number> = { high: 4, medium: 24, low: 72 };
const HOUR_MS = 3_600_000;

export type EvidenceView = {
  metric: string;
  scope: string;
  range: string;
  summary: string;
  rows: MetricRow[];
  masked: boolean;
  denied: boolean;
  ownerUserId: string | null;
};

function now(): string {
  return new Date().toISOString();
}

function scopeOf(filters: Partial<Record<Dim, string[]>>): string {
  const parts = Object.entries(filters)
    .filter(([, values]) => values && values.length > 0)
    .map(([dim, values]) => (values as string[]).map((value) => displayLabel(dim as Dim, value)).join(", "));
  return parts.join(" · ");
}

/** Re-runs the sender's queries under the reader's own scope: a packet carries references, never values. */
export function resolveEvidence(packet: ContextPacket, access: AccessContext): EvidenceView[] {
  return packet.evidence.map((query) => {
    const result = runMetric({ ...query, limit: MAX_EVIDENCE_ROWS }, access);
    const base = { metric: metricLabel(query.metric), scope: scopeOf(query.filters), range: `${formatDateTh(query.range.from)} – ${formatDateTh(query.range.to)}` };
    if (!result.ok) {
      return { ...base, summary: TH.handoff.denied, rows: [], masked: false, denied: true, ownerUserId: responsibleFor(query.metric, null)?.userId ?? null };
    }
    const masked = result.provenance.masked.length > 0;
    return {
      ...base,
      summary: result.summary,
      rows: result.rows,
      masked,
      denied: false,
      ownerUserId: masked ? (responsibleFor(query.metric, null)?.userId ?? null) : null,
    };
  });
}

export function digestOf(turns: { role: string; text: string }[]): string {
  const recent = turns.slice(-DIGEST_TURNS * 2).filter((turn) => turn.text.trim().length > 0);
  if (recent.length === 0) return "";
  return recent
    .map((turn) => `${turn.role === "user" ? TH.handoff.asked : TH.handoff.answered}: ${turn.text.slice(0, DIGEST_CHARS)}`)
    .join("\n");
}

export function slaFor(urgency: ContextPacket["urgency"]): string {
  return new Date(Date.now() + SLA_HOURS[urgency] * HOUR_MS).toISOString();
}

function notify(notification: Omit<Notification, "id" | "at" | "read">): Notification {
  return notifications().put({ ...notification, id: randomUUID(), at: now(), read: false });
}

function mail(entry: Omit<OutboxEntry, "id" | "at">): OutboxEntry {
  return outbox().put({ ...entry, id: randomUUID(), at: now() });
}

export type HandoffInput = {
  toUserId: string;
  title: string;
  ask: string;
  urgency: ContextPacket["urgency"];
  evidence: MetricQuery[];
  alertIds: string[];
  digest: string;
  suggestedActions: string[];
  threadId: string | null;
};

/** Creates the packet, the recipient's notification and the outbox mail, and remembers which thread it came from. */
export function createPacket(input: HandoffInput, sender: User | null, recipient: User): ContextPacket {
  const at = now();
  const packet: ContextPacket = {
    id: randomUUID(),
    fromUserId: sender?.id ?? "",
    toUserId: recipient.id,
    title: input.title,
    ask: input.ask,
    urgency: input.urgency,
    sla: slaFor(input.urgency),
    evidence: input.evidence,
    alertIds: input.alertIds,
    conversationDigest: input.digest || input.ask,
    suggestedActions: input.suggestedActions,
    status: "open",
    outcome: null,
    thread: [],
    createdAt: at,
    updatedAt: at,
  };
  packets().put(packet);
  const first = input.evidence[0];
  if (sender && first) {
    const scope = scopeOf(first.filters);
    rememberAction(sender.id, { type: "responsibility", value: TH.memory.sentTo(scope ? `${metricLabel(first.metric)} ${scope}` : metricLabel(first.metric), recipient.nameTh) });
  }
  if (input.threadId) packetOrigins().put({ id: packet.id, threadId: input.threadId, userId: packet.fromUserId });
  notify({ userId: recipient.id, kind: "handoff", refId: packet.id, title: TH.handoff.newFrom(sender?.nameTh ?? packet.fromUserId, packet.title) });
  mail({
    kind: "handoff",
    fromUserId: packet.fromUserId,
    toUserId: recipient.id,
    toEmail: recipient.email,
    subject: TH.handoff.mailSubject(packet.title),
    body: TH.handoff.mailBody(packet.ask, packet.id),
    refId: packet.id,
  });
  return packet;
}

function appendSystemMessage(packet: ContextPacket, text: string): void {
  const origin = packetOrigins().get(packet.id);
  if (!origin) return;
  const store = threads();
  const thread = store.get(origin.threadId);
  if (!thread) return;
  const message = { id: randomUUID(), role: "assistant", parts: [{ type: "text", text }] };
  store.put({ ...thread, messages: [...thread.messages, message], updatedAt: now() });
}

export type PacketAction = "accept" | "need_info" | "return" | "resolve";

const NEXT_STATUS: Record<PacketAction, ContextPacket["status"]> = {
  accept: "accepted",
  need_info: "need_info",
  return: "returned",
  resolve: "resolved",
};

export function defaultReply(action: PacketAction): string {
  return TH.handoff.replies[action];
}

/** Moves a packet on, tells the sender, and drops a line into the chat the packet came from. */
export function actOnPacket(packet: ContextPacket, access: AccessContext, action: PacketAction, text: string, outcome: string | null): ContextPacket {
  const at = now();
  const reply: PacketReply = { userId: access.userId, at, text };
  const updated = packets().put({
    ...packet,
    status: NEXT_STATUS[action],
    outcome: action === "resolve" ? outcome : packet.outcome,
    thread: [...packet.thread, reply],
    updatedAt: at,
  });
  const responder = findUser(access.userId)?.nameTh ?? access.userId;
  notify({ userId: packet.fromUserId, kind: "reply", refId: packet.id, title: `${responder}: ${text}` });
  appendSystemMessage(updated, TH.handoff.threadNote(responder, TH.inbox.status[updated.status], text));
  return updated;
}

export type OwnerSuggestion = { userId: string; nameTh: string; title: string; reason: string; openLoad: number; handledBefore: number };

const MIN_USUAL_SENDS = 2;

const HANDLED: ReadonlySet<ContextPacket["status"]> = new Set(["accepted", "resolved"]);

function aboutRegion(query: MetricQuery, region: string | null): boolean {
  const filtered = query.filters.region ?? [];
  return region === null ? filtered.length === 0 : filtered.includes(region);
}

/** The colleague who took this metric and region from this sender at least twice — accepted or closed it, not just received it. */
export function usualRecipient(fromUserId: string, metric: MetricQuery["metric"], region: string | null): { userId: string; sent: number } | null {
  const counts = new Map<string, number>();
  for (const packet of packets().where((entry) => entry.fromUserId === fromUserId && HANDLED.has(entry.status))) {
    if (!packet.evidence.some((query) => query.metric === metric && aboutRegion(query, region))) continue;
    counts.set(packet.toUserId, (counts.get(packet.toUserId) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return best && best[1] >= MIN_USUAL_SENDS ? { userId: best[0], sent: best[1] } : null;
}

/** Who should get this: whom this user usually sends it to, else the RACI owner; with how often they handled it and their open load. */
export function suggestOwner(metric: ContextPacket["evidence"][number]["metric"], region: string | null, fromUserId: string | null = null): OwnerSuggestion | null {
  const raci = responsibleFor(metric, (region ?? null) as never);
  const usual = fromUserId ? usualRecipient(fromUserId, metric, region) : null;
  const usualUser = usual ? findUser(usual.userId) : null;
  const target = usualUser ?? raci?.user ?? null;
  if (!target) return null;
  const theirs = packets().where((packet) => packet.toUserId === target.id);
  const handledBefore = theirs.filter((packet) => packet.evidence.some((query) => query.metric === metric)).length;
  const openLoad = theirs.filter((packet) => packet.status === "open" || packet.status === "accepted").length;
  const basis = usual && usualUser ? TH.handoff.usualReason(usual.sent, usualUser.nameTh) : (raci?.basis ?? "");
  return {
    userId: target.id,
    nameTh: target.nameTh,
    title: target.title,
    reason: TH.handoff.ownerReason(basis, handledBefore, openLoad),
    openLoad,
    handledBefore,
  };
}

export function packetsFor(userId: string): ContextPacket[] {
  return packets()
    .where((packet) => packet.toUserId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function sentPackets(userId: string): ContextPacket[] {
  return packets()
    .where((packet) => packet.fromUserId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
