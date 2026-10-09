import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { accessFor } from "@/lib/access/policies";
import type { Alert, ContextPacket, GrantRequest, NotificationKind } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { alerts, notifications, packets } from "@/lib/server/agent/collections";
import { grantRequests } from "@/lib/server/grants";
import { alertIdsTold, decisionCount, inboxCountsFor, inboxFor, movementOf } from "./inbox";

const VIEWER = "u_krit";
const made = { packets: [] as string[], alerts: [] as string[], requests: [] as string[], notes: [] as string[] };

function viewerAccess() {
  const user = findUser(VIEWER);
  if (!user) throw new Error(`missing demo user ${VIEWER}`);
  return accessFor(user);
}

function packet(status: ContextPacket["status"], alertIds: string[] = []): ContextPacket {
  const at = new Date().toISOString();
  const stored = packets().put({
    id: randomUUID(), fromUserId: "u_anucha", toUserId: VIEWER, title: "งานทดสอบที่ชื่อไม่บอกร้าน", ask: "ช่วยดูหน่อย", urgency: "high", sla: null, evidence: [], alertIds,
    conversationDigest: "", suggestedActions: [], status, outcome: null, thread: [], createdAt: at, updatedAt: at,
  });
  made.packets.push(stored.id);
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
    hypothesis: "ทดสอบ", verifySteps: ["a", "b"], ownerUserId: VIEWER, status: "open", dismissCount: 0,
  });
  made.alerts.push(stored.id);
  return stored;
}

afterEach(() => {
  for (const id of made.packets) packets().remove(id);
  for (const id of made.alerts) alerts().remove(id);
  for (const id of made.requests) grantRequests().remove(id);
  for (const id of made.notes) notifications().remove(id);
  made.packets = [];
  made.alerts = [];
  made.requests = [];
  made.notes = [];
});

describe("the bell counts only what waits on a decision", () => {
  test("a pending request to approve and a handoff not yet picked up count; an accepted handoff, a decided request, someone else's request and every notification do not", () => {
    const before = decisionCount(VIEWER);
    request("pending");
    packet("open");
    expect(decisionCount(VIEWER)).toBe(before + 2);

    packet("accepted");
    request("approved");
    request("pending", "u_wee");
    for (const kind of ["share", "grant_approved", "grant_declined", "reply", "email", "alert", "handoff", "grant_request"] as const) note(kind);
    expect(decisionCount(VIEWER)).toBe(before + 2);
  });

  test("Shared's dot counts unread shares and decisions on one's requests, never a request to approve", () => {
    const before = inboxCountsFor(VIEWER).sharedUnread;
    note("share");
    note("grant_declined");
    note("grant_approved", true);
    note("grant_request");
    note("handoff");
    expect(inboxCountsFor(VIEWER).sharedUnread).toBe(before + 2);
  });
});

describe("the Inbox payload", () => {
  test("a to-do row tells its own alert and those its button would hand on", () => {
    const base = { source: "alert", kind: "alert", story: null, rank: 0, tone: "danger", label: "", reason: "", detail: null, prompt: "", packetId: null, canFinish: true, because: null } as const;
    const handOn = { id: "a", kind: "handoff", label: "", reason: "", tool: "create_handoff", input: { alertIds: ["al_2", "al_3", 7] }, prompt: null } as const;
    const told = alertIdsTold([
      { ...base, key: "one", alertId: "al_1", actions: [] },
      { ...base, key: "team", alertId: null, actions: [{ ...handOn, input: { ...handOn.input, alertIds: [...handOn.input.alertIds] } }] },
    ]);
    expect([...told].sort()).toEqual(["al_1", "al_2", "al_3"]);
  });

  test("a handoff's number is the movement of the alert it carries, whatever its title says, and that alert is not listed again", async () => {
    const alert = alertOnViewer();
    const sent = packet("open", [alert.id]);
    const inbox = await inboxFor(viewerAccess());
    const row = inbox.handoffs.find((item) => item.id === sent.id);
    expect(row?.movement).toEqual(movementOf(alert));
    expect(row?.movement?.delta).toBe("-82.8%");
    expect(row?.movement?.ratio).toBeCloseTo(2220 / 12928);
    expect(row?.window).not.toBeNull();
    expect(inbox.alerts.map((item) => item.id)).not.toContain(alert.id);
  });

  test("returned and closed handoffs leave the Inbox; a handoff with no alert has no number", async () => {
    const kept = packet("accepted");
    const returned = packet("returned");
    const closed = packet("resolved");
    const inbox = await inboxFor(viewerAccess());
    const ids = inbox.handoffs.map((item) => item.id);
    expect(ids).toContain(kept.id);
    expect(ids).not.toContain(returned.id);
    expect(ids).not.toContain(closed.id);
    expect(inbox.handoffs.find((item) => item.id === kept.id)?.movement).toBeNull();
  });

  test("grant requests waiting on the viewer are listed with the slice in words and no value", async () => {
    const waiting = request("pending");
    request("pending", "u_wee");
    const inbox = await inboxFor(viewerAccess());
    expect(inbox.grantRequests.map((item) => item.id)).toEqual([waiting.id]);
    expect(inbox.grantRequests[0].slice).not.toMatch(/\d/);
  });
});
