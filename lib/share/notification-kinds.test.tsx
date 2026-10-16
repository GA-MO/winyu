import { describe, expect, test } from "bun:test";
import { NOTIFICATION_KINDS, type Notification } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { notificationHome, notificationTarget, notificationTitle } from "./notification-kinds";

const OLDER: Notification[] = [{ id: "n2", userId: "u_krit", at: "2026-10-08T02:00:00.000Z", kind: "alert", refId: "w_1", read: true, title: "เฝ้าดู: ยอดขายต่ำกว่าเป้า" }];

describe("every notification kind knows where it is read and where it opens", () => {
  test("what waits on a decision is read in the Inbox, what was shared and the decisions on one's own requests on Shared, mail and watches in the outbox", () => {
    const homes = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, notificationHome(kind)]));
    expect(homes).toEqual({
      alert: "outbox",
      email: "outbox",
      staff_request: "inbox",
      staff_decision: "inbox",
      share: "shared",
      matter: "inbox",
      matter_update: "inbox",
      grant_request: "inbox",
      grant_approved: "shared",
      grant_declined: "shared",
    });
  });

  test("each kind opens its page: mail and watches the outbox, a leave or training request the Inbox, shares, matters and decisions the card, a grant request its approval page", () => {
    const targets = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, notificationTarget({ kind, refId: "ref1" })]));
    expect(targets).toEqual({
      alert: "/outbox",
      email: "/outbox",
      staff_request: "/?inbox",
      staff_decision: "/",
      share: "/s/ref1",
      matter: "/s/ref1",
      matter_update: "/s/ref1",
      grant_request: "/g/ref1",
      grant_approved: "/s/ref1",
      grant_declined: "/s/ref1",
    });
  });

  test("an older kind keeps the title its writer gave it", () => {
    expect(notificationTitle({ kind: "alert", refId: "w_1", title: OLDER[0].title })).toBe(OLDER[0].title);
  });

  test("a leave decision tells the person who asked who decided and what", () => {
    expect(notificationTitle({ kind: "staff_decision", refId: "sr1", approverName: "คุณอนุชา", title: "ใบลาพักร้อน 1-2 ธ.ค.", approved: true })).toBe(TH.notify.staffApproved("คุณอนุชา", "ใบลาพักร้อน 1-2 ธ.ค."));
  });
});
