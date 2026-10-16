import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { GrantRequest, Notification } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { notifications } from "@/lib/server/agent/collections";
import { collection } from "@/lib/server/store/json-store";
import type { StaffRequest } from "./staff-requests";
import { grantRequests } from "@/lib/server/grants";
import { bellFor, decisionsFor, updatesFor } from "./bell";
import { decisionCount } from "./inbox";
import { notify } from "./notify";

const VIEWER = "u_thana";
const UNTIL = "12 ต.ค. 69";
const made = { staff: [] as string[], requests: [] as string[], notes: [] as string[] };
const STAFF_REQUESTS = "request-links";

function nameOf(userId: string): string {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return user.nameTh;
}

function leave(status: StaffRequest["status"]): StaffRequest {
  const stored = collection<StaffRequest>(STAFF_REQUESTS).put({
    id: randomUUID(), system: "leave", requestId: `lv_${randomUUID()}`, employeeId: "u_krit", approverId: VIEWER, title: "ใบลาพักร้อน", ask: "ขอลาพักร้อน", status, createdAt: new Date().toISOString(), decidedAt: null,
  });
  made.staff.push(stored.id);
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
  for (const id of made.staff.splice(0)) collection(STAFF_REQUESTS).remove(id);
  for (const id of made.requests.splice(0)) grantRequests().remove(id);
  for (const id of made.notes.splice(0)) notifications().remove(id);
});

describe("the bell's decisions are the open records the badge counts", () => {
  test("a pending grant request and a leave waiting for approval are decisions, each with who asked, its title and where it opens; a decided leave is not", () => {
    const asked = request();
    const handed = leave("pending");
    leave("approved");
    const decide = decisionsFor(VIEWER);
    expect(decide.length).toBe(decisionCount(VIEWER));
    const mine = decide.filter((item) => item.refId === asked.id || item.refId === handed.id).sort((left, right) => left.kind.localeCompare(right.kind));
    expect(mine.map((item) => [item.kind, item.target, item.person?.name])).toEqual([
      ["grant_request", `/g/${asked.id}`, nameOf("u_krit")],
      ["staff_request", "/?inbox", nameOf("u_krit")],
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
    const ours = new Set([request().id, leave("pending").id]);
    const all = [...titles, ...decisionsFor(VIEWER).filter((item) => ours.has(item.refId)).map((item) => item.title)];
    expect(all.length).toBe(6);
    for (const title of all) expect(title.replace(UNTIL, "")).not.toMatch(/\d/);
  });
});
