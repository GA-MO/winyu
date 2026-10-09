import { describe, expect, test } from "bun:test";
import { NOTIFICATION_KINDS } from "@/lib/contracts";
import { bucketOf, decisionAction, hasUnread, type BellDecision, type BellItem } from "./items";

const NOW = new Date("2026-10-09T10:00:00.000Z");
const HOUR_MS = 3_600_000;

function item(key: string, hoursAgo: number, read = true): BellItem {
  return { key, kind: "share", refId: key, title: key, person: null, at: new Date(NOW.getTime() - hoursAgo * HOUR_MS).toISOString(), read, target: `/s/${key}`, notificationId: key };
}

function decision(kind: BellDecision["kind"], refId: string, target: string): BellDecision {
  return { key: `${kind}:${refId}`, kind, refId, title: "t", person: null, at: NOW.toISOString(), read: false, target, notificationId: null };
}

describe("the bell's items", () => {
  test("only a handoff and a grant request wait on a decision; every other kind is an update", () => {
    const buckets = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, bucketOf(kind)]));
    expect(buckets).toEqual({
      handoff: "decide",
      grant_request: "decide",
      alert: "update",
      reply: "update",
      email: "update",
      share: "update",
      grant_approved: "update",
      grant_declined: "update",
    });
  });

  test("a handoff's button takes the work on its packet, a grant request's button opens the request to decide it", () => {
    expect(decisionAction(decision("handoff", "pk_1", "/c/new?preload=pk_1"))).toEqual({ type: "accept", packetId: "pk_1" });
    expect(decisionAction(decision("grant_request", "rq_1", "/g/rq_1"))).toEqual({ type: "open", href: "/g/rq_1" });
  });

  test("read all is offered only while something is unread", () => {
    expect(hasUnread({ decide: [], updates: [item("a", 1)] })).toBe(false);
    expect(hasUnread({ decide: [], updates: [item("a", 1, false)] })).toBe(true);
  });
});
