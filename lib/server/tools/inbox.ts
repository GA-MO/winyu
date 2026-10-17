import type { z } from "zod";
import { inboxInputSchema, type AccessContext, type GrantRequest, type InboxKind, type User } from "@/lib/contracts";
import { businessToday } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { sliceLabel } from "@/lib/share/grant-label";
import { holdingHop, type Matter } from "@/lib/share/matter";
import { matterFrom } from "@/lib/share/matter-actions";
import { fencedRows, MAX_CONNECTOR_ROWS } from "@/lib/server/connectors/output";
import type { ConnectorRow } from "@/lib/server/connectors/types";
import { pendingRequestsFor } from "@/lib/server/inbox";
import { pendingStaffRequestsFor, type StaffRequest } from "@/lib/server/staff-requests";
import { currentAccess } from "@/lib/server/request-context";
import { briefOf } from "@/lib/server/share/act";
import { cardHero } from "@/lib/server/share/goal";
import { mattersWaitingOn, sharePath } from "@/lib/server/share/shares";
import { matterSubject } from "@/lib/server/share/title";
import { defineTool } from "./define";

type WaitingItem = { kind: InboxKind; at: string; row: ConnectorRow };

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function staffItem(request: StaffRequest): WaitingItem {
  return {
    kind: "approval",
    at: request.createdAt,
    row: { kind_label: TH.waiting.approval[request.system], title: request.title, from_name: nameOf(request.employeeId), ask: request.ask, status_label: TH.waiting.yourCall, at_label: formatDateTh(request.createdAt) },
  };
}

function grantRequestItem(request: GrantRequest): WaitingItem {
  return {
    kind: "grant_request",
    at: request.createdAt,
    row: { kind_label: TH.waiting.kind.grant_request, title: sliceLabel(request.slice), from_name: nameOf(request.requesterId), ask: request.reason, status_label: TH.waiting.yourCall, at_label: formatDateTh(request.createdAt) },
  };
}

function dueLabel(matter: Matter): string {
  return matter.due ? TH.share.dueBy(formatDateTh(matter.due)) : TH.share.urgency[matter.urgency];
}

/** A matter as the model reads it: what it is about and its headline figure for the viewer, so a reply can name the agent, brand or region and the number; when it is due; where the viewer stands on it; and where it opens, so its row on the card links to the matter (AI-297). */
async function matterItem(matter: Matter, viewer: User): Promise<WaitingItem> {
  const brief = briefOf(matter, viewer.id);
  const hop = holdingHop(matter);
  return {
    kind: "matter",
    at: brief.at,
    row: {
      kind_label: TH.waiting.kind.matter,
      title: brief.title,
      subject: await matterSubject(matter.card, matter.focus),
      hero: await cardHero(matter.card, viewer, matter.focus),
      from_name: matterFrom(brief),
      ask: brief.ask,
      due_label: dueLabel(matter),
      status_label: hop ? TH.matter.state[hop.state] : TH.waiting.yourCall,
      at_label: formatDateTh(brief.at),
      path: sharePath(matter.id),
    },
  };
}

async function mattersFor(access: AccessContext): Promise<WaitingItem[]> {
  const viewer = findUser(access.userId);
  return viewer ? Promise.all(mattersWaitingOn(access.userId).map((matter) => matterItem(matter, viewer))) : [];
}

/** What waits on the viewer right now, newest first: matters waiting on their answer (each with what it is about, its figure and its due day), leave and training requests they approve, and temporary-access requests they decide; nobody else's items, and every colleague's words fenced as data. */
export async function waitingOn(access: AccessContext, kind: InboxKind | null) {
  const items = [
    ...pendingStaffRequestsFor(access.userId).map(staffItem),
    ...pendingRequestsFor(access.userId).map(grantRequestItem),
    ...(await mattersFor(access)),
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
    "What waits on the current user right now, read live from their own Inbox: matters colleagues sent them that wait on their answer (งานหรือเรื่องที่หัวหน้าหรือเพื่อนส่งมา), leave and training requests waiting for their approval, and temporary-access requests waiting for their decision. Only the user's own items, never anyone else's. kind narrows to one of matter, approval, grant_request; null lists them all. Call it for งานที่รอฉัน / หัวหน้าส่งงานอะไรมา / มีใบลารออนุมัติไหม / มีอะไรค้างใน Inbox. Do not answer these from recall_memory: past conversations are not the current state.",
  input: inboxInputSchema,
  execute: async ({ kind }: z.infer<typeof inboxInputSchema>) => waitingOn(currentAccess(), kind),
});
