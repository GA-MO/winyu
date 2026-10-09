import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecentList } from "@/components/inbox/drawer";
import { NOTIFICATION_KINDS, type Notification } from "@/lib/contracts";
import { notificationTarget, notificationTitle } from "./notification-kinds";

const OLDER: Notification[] = [
  { id: "n1", userId: "u_krit", at: "2026-10-08T03:00:00.000Z", kind: "handoff", refId: "pk_1", read: false, title: "งานใหม่จากคุณอนุชา: ยอดอีสาน" },
  { id: "n2", userId: "u_krit", at: "2026-10-08T02:00:00.000Z", kind: "alert", refId: "w_1", read: true, title: "เฝ้าดู: ยอดขายต่ำกว่าเป้า" },
  { id: "n3", userId: "u_krit", at: "2026-10-08T01:00:00.000Z", kind: "reply", refId: "pk_2", read: false, title: "คุณอนุชา: รับทราบ" },
  { id: "n4", userId: "u_krit", at: "2026-10-08T00:00:00.000Z", kind: "email", refId: "ob_1", read: false, title: "อีเมลใหม่: ขอสิทธิ์" },
];

describe("every notification kind knows where it opens", () => {
  test("each kind routes to its page: a handoff to its packet, mail and watches to the outbox, replies to the inbox, shares and decisions to the card, a request to its approval page", () => {
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

  test("the drawer still lists the older kinds, unread ones marked, each with its title", () => {
    const items = OLDER.map((item) => ({ id: item.id, title: item.title, at: item.at, read: item.read, href: notificationTarget(item) }));
    const html = renderToStaticMarkup(<RecentList items={items} onOpen={() => undefined} />);
    for (const item of OLDER) expect(html).toContain(item.title);
    expect(html.match(/bg-primary/g)?.length).toBe(3);
  });
});
