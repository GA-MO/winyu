import { describe, expect, test } from "bun:test";
import { NOTIFICATION_KINDS, type Notification } from "@/lib/contracts";
import { notificationHome, notificationTarget, notificationTitle } from "./notification-kinds";

const OLDER: Notification[] = [
  { id: "n1", userId: "u_krit", at: "2026-10-08T03:00:00.000Z", kind: "handoff", refId: "pk_1", read: false, title: "งานใหม่จากคุณอนุชา: ยอดอีสาน" },
  { id: "n2", userId: "u_krit", at: "2026-10-08T02:00:00.000Z", kind: "alert", refId: "w_1", read: true, title: "เฝ้าดู: ยอดขายต่ำกว่าเป้า" },
  { id: "n3", userId: "u_krit", at: "2026-10-08T01:00:00.000Z", kind: "reply", refId: "pk_2", read: false, title: "คุณอนุชา: รับทราบ" },
  { id: "n4", userId: "u_krit", at: "2026-10-08T00:00:00.000Z", kind: "email", refId: "ob_1", read: false, title: "อีเมลใหม่: ขอสิทธิ์" },
];

describe("every notification kind knows where it is read and where it opens", () => {
  test("what waits on a decision is read in the Inbox, what was shared and the decisions on one's own requests on Shared, mail and watches in the outbox", () => {
    const homes = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, notificationHome(kind)]));
    expect(homes).toEqual({
      handoff: "inbox",
      alert: "outbox",
      reply: "inbox",
      email: "outbox",
      share: "shared",
      grant_request: "inbox",
      grant_approved: "shared",
      grant_declined: "shared",
    });
  });

  test("each kind opens its page: a handoff its packet, mail and watches the outbox, replies the inbox, shares and decisions the card, a request its approval page", () => {
    const targets = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, notificationTarget({ kind, refId: "ref1" })]));
    expect(targets).toEqual({
      handoff: "/c/new?preload=ref1",
      alert: "/outbox",
      reply: "/?inbox=replies",
      email: "/outbox",
      share: "/s/ref1",
      grant_request: "/g/ref1",
      grant_approved: "/s/ref1",
      grant_declined: "/s/ref1",
    });
  });

  test("an older kind keeps the title its writer gave it", () => {
    expect(notificationTitle({ kind: "handoff", refId: "pk_1", title: OLDER[0].title })).toBe(OLDER[0].title);
  });
});
