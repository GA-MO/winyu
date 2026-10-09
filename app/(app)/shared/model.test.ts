import { describe, expect, test } from "bun:test";
import type { GivenGrant, ReceivedLine, SentLine, SentState, SharePerson } from "@/lib/share/card";
import { collapseRepeats, dayList, lastSentLabel, offersSearch, searchGroups, tabOf, tabSearch, withLiveGrants } from "./model";

const NOW = new Date("2026-10-09T03:00:00.000Z");
const HOUR_MS = 3_600_000;
const KRIT: SharePerson = { id: "u_krit", name: "คุณกฤต จันทร์เสน", photo: null };
const NOK: SharePerson = { id: "u_nok", name: "คุณนก สุขสวัสดิ์", photo: null };
const PRASIT: SharePerson = { id: "u_prasit", name: "คุณประสิทธิ์ ชัยภูมิ", photo: null };
const DELIVERED: SentState = { kind: "delivered", opened: 0, recipients: 1 };

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR_MS).toISOString();
}

function sent(code: string, title: string, people: SharePerson[], hours: number, options: { grants?: GivenGrant[]; activityHours?: number } = {}): SentLine {
  return { code, path: `/s/${code}`, title, people, sentAt: hoursAgo(hours), activityAt: hoursAgo(options.activityHours ?? hours), state: DELIVERED, unread: false, grants: options.grants ?? [] };
}

function received(code: string, title: string, hours: number, activityHours: number, state: ReceivedLine["state"]): ReceivedLine {
  return { code, path: `/s/${code}`, title, people: [PRASIT], sentAt: hoursAgo(hours), activityAt: hoursAgo(activityHours), state, unread: false, grants: [] };
}

function grant(id: string): GivenGrant {
  return { id, recipientName: KRIT.name, slice: "มูลค่าขายเข้า", until: "12 ต.ค. 2569" };
}

describe("collapseRepeats", () => {
  test("the same card to the same person four times is one row counting four, dated by its latest send", () => {
    const groups = collapseRepeats([sent("a", "มูลค่าขายเข้า", [KRIT], 50), sent("b", "มูลค่าขายเข้า", [KRIT], 2), sent("c", "มูลค่าขายเข้า", [KRIT], 300), sent("d", "มูลค่าขายเข้า", [KRIT], 9)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(4);
    expect(groups[0].lastSentAt).toBe(hoursAgo(2));
    expect(groups[0].latest.code).toBe("b");
  });

  test("the same card to another person, or another card to the same person, stays its own row", () => {
    const groups = collapseRepeats([sent("a", "มูลค่าขายเข้า", [KRIT], 1), sent("b", "มูลค่าขายเข้า", [NOK], 2), sent("c", "สต๊อกคงเหลือ", [KRIT], 3)]);
    expect(groups.map((group) => group.count)).toEqual([1, 1, 1]);
  });

  test("rows sort by latest activity, so a fresh decision on an old share lifts it above a newer send", () => {
    const groups = collapseRepeats([received("new", "สต๊อกคงเหลือ", 5, 5, { kind: "full" }), received("old", "อัตรากำไรขั้นต้น", 200, 1, { kind: "declined" })]);
    expect(groups.map((group) => group.latest.code)).toEqual(["old", "new"]);
    expect(groups[0].activityAt).toBe(hoursAgo(1));
  });

  test("a row is unread when any of its repeats is", () => {
    const lines = [sent("a", "มูลค่าขายเข้า", [KRIT], 1), { ...sent("b", "มูลค่าขายเข้า", [KRIT], 9), unread: true }];
    expect(collapseRepeats(lines)[0].unread).toBe(true);
  });
});

describe("dayList", () => {
  test("rows sit under Today, Yesterday and Previous 7 days by Bangkok calendar day of their latest activity, Older apart", () => {
    const groups = collapseRepeats([
      sent("today", "ก", [KRIT], 9),
      sent("yesterday", "ข", [KRIT], 11),
      sent("week", "ค", [KRIT], 24 * 7 + 10),
      sent("older", "ง", [KRIT], 24 * 7 + 11),
      sent("lifted", "จ", [KRIT], 24 * 40, { activityHours: 1 }),
    ]);
    const view = dayList(groups, NOW, false);
    expect(view.days.map((section) => [section.group, section.rows.map((row) => row.latest.code)])).toEqual([
      ["today", ["lifted", "today"]],
      ["yesterday", ["yesterday"]],
      ["week", ["week"]],
    ]);
    expect(view.older.map((row) => row.latest.code)).toEqual(["older"]);
  });

  test("twenty recent rows show across the day headings, the rest wait behind ดูเพิ่ม, and expanding shows them all", () => {
    const groups = collapseRepeats(Array.from({ length: 30 }, (_, index) => sent(`r${index}`, `การ์ด ${index}`, [KRIT], 5 * index + 1)));
    const folded = dayList(groups, NOW, false);
    expect(folded.days.flatMap((section) => section.rows)).toHaveLength(20);
    expect(folded.hiddenRecent).toBe(10);
    const open = dayList(groups, NOW, true);
    expect(open.hiddenRecent).toBe(0);
    expect(open.days.flatMap((section) => section.rows).length + open.older.length).toBe(30);
  });
});

describe("lastSentLabel", () => {
  test("names the last send of a repeated row only when it reads differently from the row's time", () => {
    const quiet = collapseRepeats([sent("a", "ก", [KRIT], 3), sent("b", "ก", [KRIT], 30)]);
    expect(lastSentLabel(quiet[0], NOW)).toBeNull();
    const moved = collapseRepeats([sent("a", "ก", [KRIT], 72, { activityHours: 1 }), sent("b", "ก", [KRIT], 100)]);
    expect(lastSentLabel(moved[0], NOW)).toBe("3 วันที่แล้ว");
    expect(lastSentLabel(collapseRepeats([sent("a", "ก", [KRIT], 72, { activityHours: 1 })])[0], NOW)).toBeNull();
  });
});

describe("search", () => {
  const groups = collapseRepeats([sent("a", "มูลค่าขายเข้า", [KRIT], 1), sent("b", "สต๊อกคงเหลือ", [NOK], 2)]);

  test("matches a card title or a person's name", () => {
    expect(searchGroups(groups, "สต๊อก").map((group) => group.latest.code)).toEqual(["b"]);
    expect(searchGroups(groups, " กฤต ").map((group) => group.latest.code)).toEqual(["a"]);
  });

  test("is offered only past twenty rows", () => {
    expect(offersSearch(groups)).toBe(false);
    expect(offersSearch(collapseRepeats(Array.from({ length: 21 }, (_, index) => sent(`s${index}`, `การ์ด ${index}`, [KRIT], index))))).toBe(true);
  });
});

describe("withLiveGrants", () => {
  test("keeps only rows holding a live grant, with every grant across their repeats", () => {
    const groups = collapseRepeats([sent("live", "มูลค่าขายเข้า", [KRIT], 3, { grants: [grant("g1")] }), sent("again", "มูลค่าขายเข้า", [KRIT], 30, { grants: [grant("g2")] }), sent("none", "อัตรากำไรขั้นต้น", [NOK], 1)]);
    const live = withLiveGrants(groups);
    expect(live.map((group) => group.latest.code)).toEqual(["live"]);
    expect(live[0].grants.map((given) => given.id)).toEqual(["g1", "g2"]);
  });
});

describe("the tab in the URL", () => {
  test("?tab=sent opens ฉันส่ง, anything else ส่งถึงฉัน, and each tab writes back its own query", () => {
    expect(tabOf("sent")).toBe("sent");
    expect(tabOf("received")).toBe("received");
    expect(tabOf(null)).toBe("received");
    expect(tabOf("admin")).toBe("received");
    expect(tabSearch("sent")).toBe("?tab=sent");
    expect(tabSearch("received")).toBe("");
    expect(tabOf(new URLSearchParams(tabSearch("sent")).get("tab"))).toBe("sent");
  });
});
