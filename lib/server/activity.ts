import type { AuditEntry } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { MATTER_AUDIT_TOOL, SHARE_AUDIT_TOOL } from "@/lib/server/audit";
import { shares } from "@/lib/server/share/shares";
import { surfaceEntry, toolLabel } from "@/lib/server/tools/registry";

const CHAT_SEND_TOOL = "send_card";
const GOAL_MET = "goal_met";
const WRITE_TIERS: ReadonlySet<string> = new Set(["write", "destructive"]);

/** Whose yes let one step act: the person's own tap on the card, their yes in chat, or nobody because Winyu closed it on its goal. */
export type Approval = { kind: "tap" } | { kind: "chat"; approverId: string } | { kind: "automatic" };

/** One step that changed something for someone: who, what they did, on which matter or tool, to whom, when, and whose yes let it act. Never the ask, a note, the arguments of a write or the question typed. */
export type Activity = { at: string; actorId: string; action: string; subject: string; toIds: string[]; approval: Approval };

type Parsed = { title?: unknown; to?: unknown; action?: unknown };

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

/** Who took the step: a person's name, or Winyu when it closed a matter on its goal. */
export function actorName(activity: Activity): string {
  return findUser(activity.actorId)?.nameTh ?? TH.notifications.winyu;
}

export function recipientNames(activity: Activity): string {
  return activity.toIds.map(nameOf).join(", ");
}

/** Whose yes let the step act, as the admin reads it. */
export function approvalLabel(activity: Activity): string {
  if (activity.approval.kind === "chat") return TH.adminAudit.approvedInChat(nameOf(activity.approval.approverId));
  return activity.approval.kind === "tap" ? TH.adminAudit.tapped : TH.adminAudit.automatic;
}

function isWrite(entry: AuditEntry): boolean {
  const tier = surfaceEntry(entry.tool)?.tier;
  return tier !== undefined && WRITE_TIERS.has(tier);
}

/** Whether an audit row is a step that acted: a send, a press on a matter, or a write tool that ran; refusals stay with the denials and a call that failed acted on nothing. */
export function isActivity(entry: AuditEntry): boolean {
  if (entry.decision === "deny" || entry.code) return false;
  return entry.tool === SHARE_AUDIT_TOOL || entry.tool === MATTER_AUDIT_TOOL || isWrite(entry);
}

function argsOf(entry: AuditEntry): Parsed {
  try {
    const parsed: unknown = JSON.parse(entry.args ?? "");
    return parsed && typeof parsed === "object" ? (parsed as Parsed) : {};
  } catch {
    return {};
  }
}

function idsOf(value: unknown): string[] {
  const listed = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return listed.map((item) => String(item).split(":")[0] ?? "").filter((id) => findUser(id) !== undefined);
}

function matterTitle(code: string | undefined, parsed: Parsed): string {
  if (typeof parsed.title === "string") return parsed.title;
  return (code ? shares().get(code)?.title : undefined) ?? "";
}

function sentFromChat(share: AuditEntry, writes: readonly AuditEntry[]): AuditEntry | undefined {
  return writes.find((write) => write.tool === CHAT_SEND_TOOL && write.userId === share.userId && share.at <= write.at && Date.parse(write.at) - write.latencyMs <= Date.parse(share.at));
}

function sendOf(entry: AuditEntry, writes: readonly AuditEntry[]): Activity {
  const parsed = argsOf(entry);
  const chat = sentFromChat(entry, writes);
  const approval: Approval = chat ? { kind: "chat", approverId: chat.userId } : { kind: "tap" };
  return { at: entry.at, actorId: entry.userId, action: TH.adminAudit.activityAction.send, subject: matterTitle(entry.toolCallId, parsed), toIds: idsOf(parsed.to), approval };
}

function pressOf(entry: AuditEntry): Activity {
  const parsed = argsOf(entry);
  const action = String(parsed.action ?? "");
  const approval: Approval = action === GOAL_MET ? { kind: "automatic" } : { kind: "tap" };
  return { at: entry.at, actorId: entry.userId, action: TH.adminAudit.activityAction[action] ?? action, subject: matterTitle(entry.toolCallId, {}), toIds: idsOf(parsed.to), approval };
}

function writeOf(entry: AuditEntry): Activity {
  return { at: entry.at, actorId: entry.userId, action: toolLabel(entry.tool), subject: "", toIds: [], approval: { kind: "chat", approverId: entry.userId } };
}

/** The steps that acted since a moment, newest first: each send once (a send from chat carries its sender's yes instead of showing again as a write), each press on a matter, and each write tool that ran, whose yes the gateway only spends for the person who made the call. */
export function activitiesFrom(entries: readonly AuditEntry[], since: string): Activity[] {
  const acted = [...entries].reverse().filter((entry) => entry.at >= since && isActivity(entry)).sort((left, right) => right.at.localeCompare(left.at));
  const writes = acted.filter(isWrite);
  return acted.flatMap((entry) => {
    if (entry.tool === SHARE_AUDIT_TOOL) return [sendOf(entry, writes)];
    if (entry.tool === MATTER_AUDIT_TOOL) return [pressOf(entry)];
    return entry.tool === CHAT_SEND_TOOL ? [] : [writeOf(entry)];
  });
}
