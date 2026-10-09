import { describe, expect, test } from "bun:test";
import { collapseRepeats, foldList, offersSearch, searchGroups, withLiveGrants, type ReceivedState, type ScaleGrant, type SentState, type ShareLine } from "./model";

const NOW = new Date("2026-10-09T10:00:00.000Z");
const KRIT = { id: "u_krit", name: "คุณกฤต จันทร์เสน", photo: null };
const NOK = { id: "u_nok", name: "คุณนก สุขสวัสดิ์", photo: null };
const PRASIT = { id: "u_prasit", name: "คุณประสิทธิ์ ชัยภูมิ", photo: null };

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

function sent(code: string, title: string, people: ShareLine<SentState>["people"], hours: number, grants: ScaleGrant[] = [], state: SentState = { kind: "delivered", opened: 0, recipients: people.length }): ShareLine<SentState> {
  return { code, path: `/s/${code}`, title, people, sentAt: hoursAgo(hours), state, unread: false, grants };
}

function grant(id: string, expiresInHours: number): ScaleGrant {
  return { id, recipientName: KRIT.name, slice: "มูลค่าขายเข้า", until: "x", expiresAt: hoursAgo(-expiresInHours) };
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
    const decided: ReceivedState = { kind: "declined", deciderName: PRASIT.name, at: hoursAgo(1) };
    const lines: ShareLine<ReceivedState>[] = [
      { code: "new", path: "/s/new", title: "สต๊อกคงเหลือ", people: [PRASIT], sentAt: hoursAgo(5), state: { kind: "full" }, unread: false, grants: [] },
      { code: "old", path: "/s/old", title: "อัตรากำไรขั้นต้น", people: [PRASIT], sentAt: hoursAgo(200), state: decided, unread: true, grants: [] },
    ];
    const groups = collapseRepeats(lines);
    expect(groups.map((group) => group.latest.code)).toEqual(["old", "new"]);
    expect(groups[0].activityAt).toBe(hoursAgo(1));
  });

  test("a row is unread when any of its repeats is", () => {
    const lines = [sent("a", "มูลค่าขายเข้า", [KRIT], 1), { ...sent("b", "มูลค่าขายเข้า", [KRIT], 9), unread: true }];
    expect(collapseRepeats(lines)[0].unread).toBe(true);
  });
});

describe("foldList", () => {
  const lines = Array.from({ length: 34 }, (_, index) => sent(`r${index}`, `การ์ด ${index}`, [KRIT], 24 * index + 1));
  const groups = collapseRepeats(lines);

  test("shows twenty, leaves the rest of the last 30 days behind ดูเพิ่ม, and folds anything older", () => {
    const view = foldList(groups, NOW, false);
    expect(view.shown).toHaveLength(20);
    expect(view.shown[0].latest.code).toBe("r0");
    expect(view.hiddenRecent).toBe(10);
    expect(view.older.map((group) => group.latest.code)).toEqual(["r30", "r31", "r32", "r33"]);
  });

  test("a share 31 days old folds and one 29 days old does not", () => {
    const view = foldList(collapseRepeats([sent("old", "เก่า", [KRIT], 24 * 31), sent("recent", "ใหม่", [KRIT], 24 * 29)]), NOW, false);
    expect(view.shown.map((group) => group.latest.code)).toEqual(["recent"]);
    expect(view.older.map((group) => group.latest.code)).toEqual(["old"]);
  });

  test("ดูเพิ่ม shows every recent row and leaves nothing behind", () => {
    const view = foldList(groups, NOW, true);
    expect(view.hiddenRecent).toBe(0);
    expect(view.shown.length + view.older.length).toBe(groups.length);
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
  test("keeps rows holding a live grant, with only their live grants", () => {
    const groups = collapseRepeats([
      sent("live", "มูลค่าขายเข้า", [KRIT], 3, [grant("g1", 48), grant("g0", -5)]),
      sent("expired", "สต๊อกคงเหลือ", [KRIT], 2, [grant("g2", -1)]),
      sent("none", "อัตรากำไรขั้นต้น", [NOK], 1),
    ]);
    const live = withLiveGrants(groups, NOW);
    expect(live.map((group) => group.latest.code)).toEqual(["live"]);
    expect(live[0].grants.map((given) => given.id)).toEqual(["g1"]);
  });
});
