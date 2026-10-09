import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ContextPacket, GrantRequest, Notification } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { packets, notifications } from "@/lib/server/agent/collections";
import { grantRequests } from "@/lib/server/grants";
import { bellFor, decisionsFor, updatesFor } from "./bell";
import { decisionCount } from "./inbox";
import { notify } from "./notify";

const VIEWER = "u_thana";
const UNTIL = "12 ต.ค. 69";
const made = { packets: [] as string[], requests: [] as string[], notes: [] as string[] };

function nameOf(userId: string): string {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return user.nameTh;
}

function packet(status: ContextPacket["status"]): ContextPacket {
  const at = new Date().toISOString();
  const stored = packets().put({
    id: randomUUID(), fromUserId: "u_krit", toUserId: VIEWER, title: "ร้านในขอนแก่นสั่งน้อยลง", ask: "ช่วยดู", urgency: "high", sla: null, evidence: [], alertIds: [],
    conversationDigest: "", suggestedActions: [], status, outcome: null, thread: [], createdAt: at, updatedAt: at,
  });
  made.packets.push(stored.id);
  return stored;
}

function request(): GrantRequest {
  const stored = grantRequests().put({
    id: randomUUID(), requesterId: "u_krit", approverId: VIEWER, slice: { metric: "net_sales_value", regions: "all", brands: "all" }, shareCode: "code", reason: "",
    status: "pending", createdAt: new Date().toISOString(), decidedAt: null, grantId: null,
  });
  made.requests.push(stored.id);
  return stored;
}

function remember(note: Notification): Notification {
  made.notes.push(note.id);
  return note;
}

afterEach(() => {
  for (const id of made.packets.splice(0)) packets().remove(id);
  for (const id of made.requests.splice(0)) grantRequests().remove(id);
  for (const id of made.notes.splice(0)) notifications().remove(id);
});

describe("the bell's decisions are the open records the badge counts", () => {
  test("a pending request and a handoff not picked up are decisions, each with who asked, its title and where it opens; an accepted handoff is not", () => {
    const asked = request();
    const handed = packet("open");
    packet("accepted");
    const decide = decisionsFor(VIEWER);
    expect(decide.length).toBe(decisionCount(VIEWER));
    const mine = decide.filter((item) => item.refId === asked.id || item.refId === handed.id).sort((left, right) => left.kind.localeCompare(right.kind));
    expect(mine.map((item) => [item.kind, item.target, item.person?.name])).toEqual([
      ["grant_request", `/g/${asked.id}`, nameOf("u_krit")],
      ["handoff", `/c/new?preload=${handed.id}`, nameOf("u_krit")],
    ]);
  });

  test("unread updates neither raise the badge nor join the decisions; they are updates", () => {
    const before = { count: decisionCount(VIEWER), decide: decisionsFor(VIEWER).length };
    remember(notify(VIEWER, "u_krit", { kind: "share", refId: "c1", senderName: nameOf("u_krit"), cardTitle: "ยอดขาย", grantUntil: null }, new Date(Date.now() - 1000)));
    remember(notify(VIEWER, null, { kind: "alert", refId: "w1", title: "เข้าเงื่อนไขแล้ว" }));
    expect(decisionCount(VIEWER)).toBe(before.count);
    expect(decisionsFor(VIEWER).length).toBe(before.decide);
    expect(bellFor(VIEWER).updates.slice(0, 2).map((item) => [item.kind, item.read, item.person?.name ?? null])).toEqual([
      ["alert", false, null],
      ["share", false, nameOf("u_krit")],
    ]);
  });

  test("a decision is read once its own notification was, and the notification for it never shows as an update", () => {
    const asked = request();
    const note = remember(notify(VIEWER, "u_krit", { kind: "grant_request", refId: asked.id, requesterName: nameOf("u_krit"), slice: "มูลค่าขายเข้า · ทุกภาค" }));
    notifications().put({ ...note, read: true });
    const row = decisionsFor(VIEWER).find((item) => item.refId === asked.id);
    expect(row).toMatchObject({ read: true, notificationId: note.id });
    expect(updatesFor(VIEWER).some((item) => item.key === note.id)).toBe(false);
  });
});

describe("no title carries a number from a card", () => {
  test("shares, requests and decisions on them are told by names, the card's title and the slice in words; only the grant's end date has digits", () => {
    const krit = nameOf("u_krit");
    const slice = "มูลค่าขายเข้า · ทุกภาค · ทุกแบรนด์";
    const titles = [
      notify(VIEWER, "u_krit", { kind: "share", refId: "c1", senderName: krit, cardTitle: "มูลค่าขายเข้า", grantUntil: null }),
      notify(VIEWER, "u_krit", { kind: "share", refId: "c2", senderName: krit, cardTitle: "มูลค่าขายเข้า", grantUntil: UNTIL }),
      notify(VIEWER, "u_krit", { kind: "grant_approved", refId: "c1", approverName: krit, slice, until: UNTIL }),
      notify(VIEWER, "u_krit", { kind: "grant_declined", refId: "c1", deciderName: krit, slice }),
    ].map((note) => remember(note).title);
    const ours = new Set([request().id, packet("open").id]);
    const all = [...titles, ...decisionsFor(VIEWER).filter((item) => ours.has(item.refId)).map((item) => item.title)];
    expect(all.length).toBe(6);
    for (const title of all) expect(title.replace(UNTIL, "")).not.toMatch(/\d/);
  });
});
