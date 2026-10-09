import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { collapseRepeats, withLiveGrants } from "@/app/(app)/shared/model";
import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { ReceivedState, SentState } from "@/lib/share/card";
import { notifications } from "@/lib/server/agent/collections";
import { auditLog } from "@/lib/server/audit";
import { approveRequest, declineRequest, grantRequests, grants, requestGrant, revokeGrant } from "@/lib/server/grants";
import { notify } from "@/lib/server/notify";
import { receivedShares, sentShares } from "./lists";
import { noteView, shares, type Share } from "./shares";

const BY_REGION = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null };
const TITLE = "มูลค่าขายเข้า แยกตามภาค";
const OTHER_TITLE = "มูลค่าขายเข้า แยกตามแบรนด์";
const NOTE = "ช่วยดูภาคอีสานหน่อย";
const VALUE_WORDS = /บาท|ลิตร|%/;
const HOUR_MS = 3_600_000;
const made: string[] = [];

function user(id: string): User {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

function storedShare(senderId: string, recipientId: string, options: { title?: string; hours?: number } = {}): Share {
  const share = shares().put({
    id: randomUUID().slice(0, 12), at: hoursAgo(options.hours ?? 0), senderId, title: options.title ?? TITLE, question: null, note: NOTE,
    card: { kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] }, deliveries: [{ userId: recipientId, asked: "email", via: "email", fallback: null }], openedBy: [], lastViewedAt: null,
  });
  made.push(share.id);
  return share;
}

function receivedOf(viewerId: string, code: string) {
  return receivedShares(user(viewerId)).find((row) => row.code === code);
}

function sentOf(senderId: string, code: string) {
  return sentShares(user(senderId)).find((row) => row.code === code);
}

function stateWithoutDates(state: ReceivedState | SentState | undefined): string {
  if (!state) return "";
  const { until: _date, ...rest } = { until: null, ...state };
  return JSON.stringify(rest);
}

async function askedBy(requesterId: string, share: Share) {
  const asked = await requestGrant(user(requesterId), share.id, "");
  if (!asked.ok) throw new Error(asked.problem);
  return asked.request;
}

afterEach(() => {
  const requestIds = grantRequests().all().map((request) => request.id);
  for (const item of notifications().where((entry) => made.includes(entry.refId) || requestIds.includes(entry.refId))) notifications().remove(item.id);
  for (const id of made) shares().remove(id);
  for (const grant of grants().all()) grants().remove(grant.id);
  for (const id of requestIds) grantRequests().remove(id);
  made.length = 0;
});

describe("Shared lists what was sent to the person and what they sent", () => {
  test("the recipient sees the sender, what the card hides by name and the unread mark; the sender sees the recipient and views; no title or state carries a value", () => {
    const share = storedShare("u_thana", "u_krit");
    notify("u_krit", "u_thana", { kind: "share", refId: share.id, senderName: user("u_thana").nameTh, cardTitle: share.title, grantUntil: null });

    const received = receivedOf("u_krit", share.id);
    expect(received).toMatchObject({ path: `/s/${share.id}`, title: TITLE, people: [{ id: "u_thana", name: user("u_thana").nameTh }], sentAt: share.at, activityAt: share.at, unread: true, grants: [] });
    const hidden = received?.state.kind === "hidden" ? received.state.slice : "";
    expect(hidden).toContain(TH.region.south);
    expect(hidden).not.toContain(TH.region.northeast);

    const sent = sentOf("u_thana", share.id);
    expect(sent).toMatchObject({ path: `/s/${share.id}`, title: TITLE, people: [{ id: "u_krit", name: user("u_krit").nameTh }], state: { kind: "delivered", opened: 0, recipients: 1 }, unread: false, grants: [] });

    expect(sentShares(user("u_krit")).map((row) => row.code)).not.toContain(share.id);
    expect(receivedShares(user("u_thana")).map((row) => row.code)).not.toContain(share.id);
    expect(receivedShares(user("u_wee")).map((row) => row.code)).not.toContain(share.id);
    for (const row of [received, sent]) {
      expect(row?.title).not.toMatch(/\d/);
      expect(JSON.stringify(row)).not.toMatch(VALUE_WORDS);
    }
  });

  test("a request is pending for the recipient and asked for the sender, unread in the sender's Inbox; once approved both sides see the grant with its end date", async () => {
    const share = storedShare("u_thana", "u_krit", { hours: 5 });
    const request = await askedBy("u_krit", share);
    expect(receivedOf("u_krit", share.id)?.state).toEqual({ kind: "pending", approverName: user("u_thana").nameTh });
    expect(sentOf("u_thana", share.id)).toMatchObject({ state: { kind: "asked", requesterName: user("u_krit").nameTh }, unread: true, activityAt: request.createdAt });

    const decided = await approveRequest(request.id, user("u_thana"), 3);
    if (!decided.ok || !decided.grant) throw new Error("not approved");
    const received = receivedOf("u_krit", share.id);
    const until = received?.state.kind === "granted" ? received.state.until : "";
    expect(until).toBeTruthy();
    expect(received?.activityAt).toBe(decided.grant.createdAt);
    expect(sentOf("u_thana", share.id)?.grants).toEqual([{ id: decided.grant.id, recipientName: user("u_krit").nameTh, slice: expect.any(String), until }]);
    expect(sentOf("u_thana", share.id)?.state.kind).toBe("delivered");
  });

  test("a declined request reads as declined, and the decision lifts an old share above a newer one", async () => {
    const old = storedShare("u_thana", "u_krit", { hours: 200 });
    const recent = storedShare("u_thana", "u_krit", { title: OTHER_TITLE, hours: 5 });
    const request = await askedBy("u_krit", old);
    const declined = await declineRequest(request.id, user("u_thana"));
    if (!declined.ok) throw new Error(declined.problem);

    const rows = receivedShares(user("u_krit")).filter((row) => made.includes(row.code));
    expect(rows.map((row) => row.code)).toEqual([old.id, recent.id]);
    expect(rows[0].state).toEqual({ kind: "declined" });
    expect(rows[0].activityAt).toBe(declined.request.decidedAt as string);
    for (const row of rows) expect(stateWithoutDates(row.state)).not.toMatch(/\d/);
  });

  test("the same card sent to the same person three times is one row counting three", () => {
    for (const hours of [30, 2, 50]) storedShare("u_thana", "u_krit", { hours });
    storedShare("u_thana", "u_anucha", { hours: 1 });

    const rows = collapseRepeats(sentShares(user("u_thana")).filter((row) => made.includes(row.code)));
    expect(rows.map((row) => [row.latest.people[0]?.id, row.count])).toEqual([["u_anucha", 1], ["u_krit", 3]]);
    expect(rows[1].lastSentAt).toBe(rows[1].latest.sentAt);
  });
});

describe("how many opened a share", () => {
  test("a recipient counts once however often the page renders, the sender opening it does not count, and an opening moves the share", () => {
    const share = storedShare("u_thana", "u_krit", { hours: 5 });
    const at = new Date().toISOString();
    for (let render = 0; render < 5; render += 1) noteView(shares().get(share.id) ?? share, "u_krit", at);
    noteView(shares().get(share.id) ?? share, "u_thana", at);

    expect(sentOf("u_thana", share.id)).toMatchObject({ state: { kind: "delivered", opened: 1, recipients: 1 }, activityAt: at });
  });

  test("a share stored before openings were kept reads as unopened", () => {
    const share = storedShare("u_thana", "u_krit");
    const { openedBy: _dropped, ...legacy } = share;
    shares().put(legacy);

    expect(sentOf("u_thana", share.id)?.state).toEqual({ kind: "delivered", opened: 0, recipients: 1 });
  });
});

describe("revoking from Shared's live-grant filter", () => {
  test("only the grantor may revoke; the revoke is audited and the row leaves the filter and both sides", async () => {
    const share = storedShare("u_thana", "u_krit");
    storedShare("u_thana", "u_anucha", { title: OTHER_TITLE });
    const request = await askedBy("u_krit", share);
    const decided = await approveRequest(request.id, user("u_thana"), 1);
    if (!decided.ok || !decided.grant) throw new Error("not approved");
    const liveRows = () => withLiveGrants(collapseRepeats(sentShares(user("u_thana")).filter((row) => made.includes(row.code))));
    const [row] = liveRows();
    expect(liveRows()).toHaveLength(1);
    const [given] = row.grants;

    expect(revokeGrant(given.id, user("u_krit"))).toBe(false);
    expect(revokeGrant(given.id, user("u_thana"))).toBe(true);

    expect(liveRows()).toEqual([]);
    expect(receivedOf("u_krit", share.id)?.state.kind).toBe("hidden");
    const audited = auditLog().where((entry) => entry.toolCallId === given.id);
    expect(audited.map((entry) => [entry.userId, entry.decision, entry.reason])).toContainEqual(["u_thana", "allow", TH.grant.audit.revoked(user("u_krit").nameTh)]);
  });
});
