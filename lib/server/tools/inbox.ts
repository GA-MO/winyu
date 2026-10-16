import type { z } from "zod";
import { inboxInputSchema, type AccessContext, type ContextPacket, type GrantRequest, type InboxKind } from "@/lib/contracts";
import { businessToday } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { sliceLabel } from "@/lib/share/grant-label";
import { matterFrom, type MatterBrief } from "@/lib/share/matter-actions";
import { requestLinks } from "@/lib/server/agent/collections";
import { fencedRows, MAX_CONNECTOR_ROWS } from "@/lib/server/connectors/output";
import type { ConnectorRow } from "@/lib/server/connectors/types";
import { pendingRequestsFor, undecidedHandoffsFor } from "@/lib/server/inbox";
import { currentAccess } from "@/lib/server/request-context";
import { briefOf } from "@/lib/server/share/act";
import { mattersWaitingOn } from "@/lib/server/share/shares";
import { defineTool } from "./define";

type WaitingItem = { kind: InboxKind; at: string; row: ConnectorRow };

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function packetItem(packet: ContextPacket): WaitingItem {
  const approval = requestLinks().get(packet.id);
  return {
    kind: approval ? "approval" : "handoff",
    at: packet.createdAt,
    row: {
      kind_label: approval ? TH.waiting.approval[approval.system] : TH.waiting.kind.handoff,
      title: packet.title,
      from_name: nameOf(packet.fromUserId),
      ask: packet.ask,
      status_label: TH.inbox.status[packet.status],
      at_label: formatDateTh(packet.createdAt),
    },
  };
}

function grantRequestItem(request: GrantRequest): WaitingItem {
  return {
    kind: "grant_request",
    at: request.createdAt,
    row: { kind_label: TH.waiting.kind.grant_request, title: sliceLabel(request.slice), from_name: nameOf(request.requesterId), ask: request.reason, status_label: TH.waiting.yourCall, at_label: formatDateTh(request.createdAt) },
  };
}

function matterItem(brief: MatterBrief): WaitingItem {
  return {
    kind: "shared_card",
    at: brief.at,
    row: { kind_label: TH.waiting.kind.shared_card, title: brief.title, from_name: matterFrom(brief), ask: brief.ask, status_label: TH.waiting.yourCall, at_label: formatDateTh(brief.at) },
  };
}

/** What waits on the viewer right now, newest first: handoffs sent to them, leave and training requests they approve, temporary-access requests they decide, and shared cards waiting on their answer; nobody else's items, and every colleague's words fenced as data. */
export function waitingOn(access: AccessContext, kind: InboxKind | null) {
  const items = [
    ...undecidedHandoffsFor(access.userId).map(packetItem),
    ...pendingRequestsFor(access.userId).map(grantRequestItem),
    ...mattersWaitingOn(access.userId).map((matter) => matterItem(briefOf(matter, access.userId))),
  ]
    .filter((item) => kind === null || item.kind === kind)
    .sort((left, right) => right.at.localeCompare(left.at));
  return {
    ok: true as const,
    summary: TH.waiting.summary(items.length),
    rows: fencedRows(items.slice(0, MAX_CONNECTOR_ROWS).map((item) => item.row)),
    provenance: { sourceSystem: TH.waiting.source, asOf: businessToday(), masked: [] },
  };
}

export const inboxTool = defineTool({
  name: "inbox",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description:
    "What waits on the current user right now, read live from their own Inbox: handoffs sent to them (งานที่หัวหน้าหรือเพื่อนส่งมา), leave and training requests waiting for their approval, temporary-access requests waiting for their decision, and shared cards waiting for their answer. Only the user's own items, never anyone else's. kind narrows to one of handoff, approval, grant_request, shared_card; null lists them all. Call it for งานที่รอฉัน / หัวหน้าส่งงานอะไรมา / มีใบลารออนุมัติไหม / มีอะไรค้างใน Inbox. Do not answer these from recall_memory: past conversations are not the current state.",
  input: inboxInputSchema,
  execute: async ({ kind }: z.infer<typeof inboxInputSchema>) => waitingOn(currentAccess(), kind),
});
