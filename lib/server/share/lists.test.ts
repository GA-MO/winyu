import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { notifications } from "@/lib/server/agent/collections";
import { auditLog } from "@/lib/server/audit";
import { approveRequest, grantRequests, grants, requestGrant, revokeGrant } from "@/lib/server/grants";
import { notify } from "@/lib/server/notify";
import { receivedShares, sentShares } from "./lists";
import { noteView, shares, type Share } from "./shares";

const BY_REGION = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null };
const TITLE = "มูลค่าขายเข้า แยกตามภาค";
const NOTE = "ช่วยดูภาคอีสานหน่อย";
const VALUE_WORDS = /บาท|ลิตร|%/;
const made: string[] = [];

function user(id: string): User {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function storedShare(senderId: string, recipientId: string): Share {
  const share = shares().put({
    id: randomUUID().slice(0, 12), at: new Date().toISOString(), senderId, title: TITLE, question: null, note: NOTE,
    card: { kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] }, deliveries: [{ userId: recipientId, asked: "email", via: "email", fallback: null }], openedBy: [], lastViewedAt: null,
  });
  made.push(share.id);
  return share;
}

afterEach(() => {
  for (const id of made) shares().remove(id);
  for (const grant of grants().all()) grants().remove(grant.id);
  for (const request of grantRequests().all()) grantRequests().remove(request.id);
  for (const item of notifications().where((entry) => made.includes(entry.refId))) notifications().remove(item.id);
  made.length = 0;
});

describe("Shared lists what was sent to the person and what they sent", () => {
  test("the recipient sees sender, note, what the card hides by name, and the unread mark; the sender sees recipients by channel and views; neither carries a value", () => {
    const share = storedShare("u_thana", "u_krit");
    notify("u_krit", "u_thana", { kind: "share", refId: share.id, senderName: user("u_thana").nameTh, cardTitle: share.title, grantUntil: null });

    const received = receivedShares(user("u_krit")).find((row) => row.code === share.id);
    expect(received).toMatchObject({ path: `/s/${share.id}`, title: TITLE, senderName: user("u_thana").nameTh, note: NOTE, request: null, grant: null, unread: true });
    expect(received?.hidden).toContain(TH.region.south);
    expect(received?.hidden).not.toContain(TH.region.northeast);

    const sent = sentShares(user("u_thana")).find((row) => row.code === share.id);
    expect(sent).toMatchObject({ path: `/s/${share.id}`, title: TITLE, opened: 0, recipients: 1, grants: [] });
    expect(sent?.receipts.map((receipt) => [receipt.name, receipt.via])).toEqual([[user("u_krit").nameTh, "email"]]);

    expect(sentShares(user("u_krit")).map((row) => row.code)).not.toContain(share.id);
    expect(receivedShares(user("u_thana")).map((row) => row.code)).not.toContain(share.id);
    expect(receivedShares(user("u_wee")).map((row) => row.code)).not.toContain(share.id);
    for (const row of [received, sent]) {
      expect(row?.title).not.toMatch(/\d/);
      expect(JSON.stringify(row)).not.toMatch(VALUE_WORDS);
    }
  });

  test("a request shows as pending for the recipient; once approved both sides see the grant with its end date", async () => {
    const share = storedShare("u_thana", "u_krit");
    const asked = await requestGrant(user("u_krit"), share.id, "");
    if (!asked.ok) throw new Error(asked.problem);
    expect(receivedShares(user("u_krit")).find((row) => row.code === share.id)?.request).toEqual({ approverName: user("u_thana").nameTh });

    const decided = await approveRequest(asked.request.id, user("u_thana"), 3);
    if (!decided.ok || !decided.grant) throw new Error("not approved");
    const until = receivedShares(user("u_krit")).find((row) => row.code === share.id)?.grant?.until;
    expect(until).toBeTruthy();
    expect(sentShares(user("u_thana")).find((row) => row.code === share.id)?.grants).toEqual([{ id: decided.grant.id, recipientName: user("u_krit").nameTh, slice: expect.any(String), until: until as string }]);
  });
});

describe("how many opened a share", () => {
  test("a recipient counts once however often the page renders, and the sender opening it does not count", () => {
    const share = storedShare("u_thana", "u_krit");
    const at = new Date().toISOString();
    for (let render = 0; render < 5; render += 1) noteView(shares().get(share.id) ?? share, "u_krit", at);
    noteView(shares().get(share.id) ?? share, "u_thana", at);

    expect(sentShares(user("u_thana")).find((row) => row.code === share.id)).toMatchObject({ opened: 1, recipients: 1 });
  });

  test("a share stored before openings were kept reads as unopened", () => {
    const share = storedShare("u_thana", "u_krit");
    const { openedBy: _dropped, ...legacy } = share;
    shares().put(legacy);

    expect(sentShares(user("u_thana")).find((row) => row.code === share.id)).toMatchObject({ opened: 0, recipients: 1 });
  });
});

describe("revoking from Shared", () => {
  test("only the grantor may revoke; the grant leaves both lists and the revoke is audited", async () => {
    const share = storedShare("u_thana", "u_krit");
    const asked = await requestGrant(user("u_krit"), share.id, "");
    if (!asked.ok) throw new Error(asked.problem);
    const decided = await approveRequest(asked.request.id, user("u_thana"), 1);
    if (!decided.ok || !decided.grant) throw new Error("not approved");
    const [given] = sentShares(user("u_thana")).find((row) => row.code === share.id)?.grants ?? [];

    expect(revokeGrant(given.id, user("u_krit"))).toBe(false);
    expect(revokeGrant(given.id, user("u_thana"))).toBe(true);

    expect(sentShares(user("u_thana")).find((row) => row.code === share.id)?.grants).toEqual([]);
    expect(receivedShares(user("u_krit")).find((row) => row.code === share.id)?.grant).toBeNull();
    const rows = auditLog().where((entry) => entry.toolCallId === given.id);
    expect(rows.map((row) => [row.userId, row.decision, row.reason])).toContainEqual(["u_thana", "allow", TH.grant.audit.revoked(user("u_krit").nameTh)]);
  });
});
