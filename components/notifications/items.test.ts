import { describe, expect, test } from "bun:test";
import { NOTIFICATION_KINDS } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { bellSignal, bucketOf, hasUnread, type BellItem } from "./items";

const NOW = new Date("2026-10-09T10:00:00.000Z");
const HOUR_MS = 3_600_000;

function item(key: string, hoursAgo: number, read = true): BellItem {
  return { key, kind: "share", refId: key, title: key, person: null, at: new Date(NOW.getTime() - hoursAgo * HOUR_MS).toISOString(), read, target: `/s/${key}`, notificationId: key };
}

describe("the bell's items", () => {
  test("a leave or training request, a grant request and a matter that asks for an answer wait on a decision; every other kind is an update", () => {
    const buckets = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, bucketOf(kind)]));
    expect(buckets).toEqual({
      staff_request: "decide",
      grant_request: "decide",
      matter: "decide",
      matter_update: "update",
      staff_decision: "update",
      alert: "update",
      email: "update",
      share: "update",
      grant_approved: "update",
      grant_declined: "update",
    });
  });

  test("read all is offered only while something is unread", () => {
    expect(hasUnread({ decide: [], updates: [item("a", 1)] })).toBe(false);
    expect(hasUnread({ decide: [], updates: [item("a", 1, false)] })).toBe(true);
  });
});

describe("the closed bell", () => {
  test("counts the decisions waiting on the person", () => {
    expect(bellSignal({ decisions: 2, sharedUnread: 0, unreadUpdates: 3 })).toEqual({ badge: 2, label: TH.notifications.bellWaiting(2) });
  });

  test("shows a dot for unread news such as a matter passed on or taken up when nothing waits on a decision", () => {
    expect(bellSignal({ decisions: 0, sharedUnread: 0, unreadUpdates: 2 })).toEqual({ badge: "dot", label: TH.notifications.bellUnread });
  });

  test("shows nothing when everything is read", () => {
    expect(bellSignal({ decisions: 0, sharedUnread: 0, unreadUpdates: 0 }).badge).toBeNull();
  });
});
