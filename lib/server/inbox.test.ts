import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { accessFor } from "@/lib/access/policies";
import type { Alert, GrantRequest, NotificationKind } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { alerts, notifications } from "@/lib/server/agent/collections";
import { grantRequests } from "@/lib/server/grants";
import { collection } from "@/lib/server/store/json-store";
import type { Matter } from "@/lib/share/matter";
import { createShare } from "./share/deliver";
import { actOnMatter } from "./share/act";
import { shares } from "./share/shares";
import type { StaffRequest } from "./staff-requests";
import { alertIdsTold, decisionCount, inboxCountsFor, inboxFor, movementOf } from "./inbox";

const VIEWER = "u_krit";
const made = { matters: [] as string[], staff: [] as string[], alerts: [] as string[], requests: [] as string[], notes: [] as string[] };
const STAFF_REQUESTS = "request-links";
const CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null } }] };

function viewerAccess() {
  const user = findUser(VIEWER);
  if (!user) throw new Error(`missing demo user ${VIEWER}`);
  return accessFor(user);
}

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`missing demo user ${id}`);
  return found;
}

async function matter(alertIds: string[] = []): Promise<Matter> {
  const outcome = await createShare(user("u_anucha"), { card: CARD, question: null, ask: "ช่วยดูหน่อย", intent: "act", recipients: [{ userId: VIEWER, channel: "winyu" }], alertIds });
  if (!outcome.ok) throw new Error(outcome.error);
  made.matters.push(outcome.share.id);
  return outcome.share;
}

function leave(status: StaffRequest["status"]): StaffRequest {
  const stored = collection<StaffRequest>(STAFF_REQUESTS).put({
    id: randomUUID(), system: "leave", requestId: `lv_${randomUUID()}`, employeeId: "u_wee", approverId: VIEWER, title: "ใบลาพักร้อน", ask: "ขอลาพักร้อน", status, createdAt: new Date().toISOString(), decidedAt: null,
  });
  made.staff.push(stored.id);
  return stored;
}

function request(status: GrantRequest["status"], approverId = VIEWER): GrantRequest {
  const stored = grantRequests().put({
    id: randomUUID(), requesterId: "u_wee", approverId, slice: { metric: "net_sales_value", regions: "all", brands: "all" }, shareCode: "nothing", reason: "",
    status, createdAt: new Date().toISOString(), decidedAt: null, grantId: null,
  });
  made.requests.push(stored.id);
  return stored;
}

function note(kind: NotificationKind, read = false) {
  const stored = notifications().put({ id: randomUUID(), userId: VIEWER, at: new Date().toISOString(), kind, refId: "ref", read, title: "t" });
  made.notes.push(stored.id);
}

function alertOnViewer(): Alert {
  const stored = alerts().put({
    id: `al_test_${randomUUID().slice(0, 8)}`, at: new Date().toISOString(), severity: "P1", metric: "net_sales_volume", dims: { region: "northeast" },
    window: { from: "2026-09-01", to: "2026-09-22" }, observed: 2220, expected: 12928, zScore: -4, direction: "down",
    hypothesis: "ทดสอบ", verifySteps: [{ text: "a", metrics: ["net_sales_volume"] }, { text: "b", metrics: ["net_sales_volume"] }], ownerUserId: VIEWER, status: "open", dismissCount: 0,
  });
  made.alerts.push(stored.id);
  return stored;
}

afterEach(() => {
  for (const id of made.matters) shares().remove(id);
  for (const id of made.staff) collection(STAFF_REQUESTS).remove(id);
  for (const id of made.alerts) alerts().remove(id);
  for (const id of made.requests) grantRequests().remove(id);
  for (const id of made.notes) notifications().remove(id);
  made.matters = [];
  made.staff = [];
  made.alerts = [];
  made.requests = [];
  made.notes = [];
});

describe("the bell counts only what waits on a decision", () => {
  test("a pending grant request, a leave to approve and a matter not yet answered count; an accepted matter, a decided leave, someone else's request and every notification do not", async () => {
    const before = decisionCount(VIEWER);
    request("pending");
    leave("pending");
    await matter();
    expect(decisionCount(VIEWER)).toBe(before + 3);

    const accepted = await matter();
    expect(decisionCount(VIEWER)).toBe(before + 4);
    actOnMatter(user(VIEWER), accepted.id, { kind: "accept" });
    leave("approved");
    request("approved");
    request("pending", "u_wee");
    for (const kind of ["share", "grant_approved", "grant_declined", "email", "alert", "matter", "matter_update", "staff_decision", "grant_request"] as const) note(kind);
    expect(decisionCount(VIEWER)).toBe(before + 3);
  });

  test("Shared's dot counts unread shares and decisions on one's requests, never a request to approve", () => {
    const before = inboxCountsFor(VIEWER).sharedUnread;
    note("share");
    note("grant_declined");
    note("grant_approved", true);
    note("grant_request");
    note("staff_request");
    expect(inboxCountsFor(VIEWER).sharedUnread).toBe(before + 2);
  });

  test("the sender's bell has unread news when the matter they sent is taken up, and none once it is read", async () => {
    const sender = "u_anucha";
    const sent = await matter();
    const before = inboxCountsFor(sender).unreadUpdates;
    actOnMatter(user(VIEWER), sent.id, { kind: "accept" });
    const told = notifications().where((item) => item.userId === sender && item.refId === sent.id && item.kind === "matter_update");
    made.notes.push(...told.map((item) => item.id));
    expect(told).toHaveLength(1);
    expect(inboxCountsFor(sender).unreadUpdates).toBe(before + 1);
    for (const item of told) notifications().put({ ...item, read: true });
    expect(inboxCountsFor(sender).unreadUpdates).toBe(before);
  });
});

describe("the Inbox payload", () => {
  test("a to-do row tells its own alert and those its button would hand on", () => {
    const base = { source: "alert", kind: "alert", story: null, rank: 0, tone: "danger", label: "", reason: "", detail: null, prompt: "", canFinish: true, because: null } as const;
    const handOn = { id: "a", kind: "send", label: "", reason: "", tool: "send_card", input: { alertIds: ["al_2", "al_3", 7] }, prompt: null } as const;
    const told = alertIdsTold([
      { ...base, key: "one", alertId: "al_1", actions: [] },
      { ...base, key: "team", alertId: null, actions: [{ ...handOn, input: { ...handOn.input, alertIds: [...handOn.input.alertIds] } }] },
    ]);
    expect([...told].sort()).toEqual(["al_1", "al_2", "al_3"]);
  });

  test("the Korat share alert moves in points, the one figure its bar and its story give (AI-272)", () => {
    expect(movementOf({ metric: "market_share", observed: 59.4, expected: 62.9 })).toMatchObject({ delta: "-3.5 จุด", observed: "59.4%", expected: "62.9%", tone: "bad" });
  });

  test("an alert a matter waiting on the viewer carries is told by the matter, and not listed again", async () => {
    const alert = alertOnViewer();
    expect(movementOf(alert).delta).toBe("-82.8%");
    const sent = await matter([alert.id]);
    const inbox = await inboxFor(viewerAccess());
    expect(inbox.matters.map((brief) => brief.code)).toContain(sent.id);
    expect(inbox.matters.find((brief) => brief.code === sent.id)?.judges).toBe(true);
    expect(inbox.alerts.map((item) => item.id)).not.toContain(alert.id);
  });

  test("a leave waiting on the viewer is listed with who asked; a decided one leaves the Inbox", async () => {
    const waiting = leave("pending");
    const decided = leave("declined");
    const ids = (await inboxFor(viewerAccess())).staffRequests.map((item) => item.id);
    expect(ids).toContain(waiting.id);
    expect(ids).not.toContain(decided.id);
  });

  test("grant requests waiting on the viewer are listed with the slice in words and no value", async () => {
    const waiting = request("pending");
    request("pending", "u_wee");
    const inbox = await inboxFor(viewerAccess());
    expect(inbox.grantRequests.map((item) => item.id)).toEqual([waiting.id]);
    expect(inbox.grantRequests[0].slice).not.toMatch(/\d/);
  });

  test("an alert row offers to send the alert to its owner only to someone who can send cards, and never to the owner themselves", async () => {
    const rep = accessFor(user("u_nok"));
    const withoutSending = { ...rep, toolAllow: rep.toolAllow.filter((tool) => tool !== "send_card") };
    const repAlerts = (await inboxFor(withoutSending)).alerts;
    expect(repAlerts.length).toBeGreaterThan(0);
    expect(repAlerts.map((item) => item.sendPrompt)).toEqual(repAlerts.map(() => null));
    const ceoAlerts = (await inboxFor(accessFor(user("u_thana")))).alerts;
    expect(ceoAlerts.some((item) => item.sendPrompt !== null)).toBe(true);
    const ownAlerts = (await inboxFor(accessFor(user("u_somchai")))).alerts.filter((item) => item.ownerName === user("u_somchai").nameTh);
    expect(ownAlerts.map((item) => item.sendPrompt)).toEqual(ownAlerts.map(() => null));
  });
});
