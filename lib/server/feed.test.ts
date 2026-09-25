import { afterEach, describe, expect, test } from "bun:test";
import type { AccessContext, FeedItem } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { EMPLOYEES } from "@/lib/data/entities/people";
import { USERS, findUser } from "@/lib/data/entities/users";
import { feedStates } from "@/lib/server/agent/collections";
import { actOnFeedItem, feedFor, landingFeedFor } from "./feed";
import { quickActionsFor } from "./quick-actions";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-09-25T09:00:00.000Z");
const RISK_LABEL = "เสี่ยงลาออกสูง";

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return liveAccessFor(user);
}

function personIdOf(item: FeedItem): string {
  return item.key.split(":")[1] ?? "";
}

afterEach(() => {
  for (const record of feedStates().all()) feedStates().remove(record.id);
});

describe("every role gets its own feed", () => {
  test("people items come only from the people a user answers for, and only HR sees attrition risk", async () => {
    for (const user of USERS) {
      const items = await feedFor(accessOf(user.id), NOW);
      expect(items.map((item) => item.rank)).toEqual([...items.map((item) => item.rank)].sort((left, right) => right - left));
      for (const item of items.filter((candidate) => candidate.source === "person")) {
        const employee = EMPLOYEES.find((candidate) => candidate.id === personIdOf(item));
        expect(employee).toBeDefined();
        expect(employee?.id).not.toBe(user.id);
        if (user.role !== "hr_manager") expect(employee?.managerId).toBe(user.id);
        if (user.role !== "hr_manager") expect(`${item.reason} ${item.detail}`).not.toContain(RISK_LABEL);
      }
    }
  });

  test("HR leads with the licence closest to lapsing and sees the opening left longest", async () => {
    const items = await feedFor(accessOf("u_may"), NOW);
    expect(items[0]).toMatchObject({ source: "person", label: "คุณแดง ศักดิ์ดี", reason: "ใบขับขี่รถยก 8 วัน", tone: "danger" });
    expect(items[0].detail).toContain(RISK_LABEL);
    expect(items.some((item) => item.source === "opening" && item.reason === "เปิดรับมา 99 วัน")).toBe(true);
  });

  test("a regional sales manager sees their own reps' licences and their own opening, next to the region's alerts", async () => {
    const items = await feedFor(accessOf("u_anucha"), NOW);
    const people = items.filter((item) => item.source === "person").map((item) => item.label);
    expect(people).toContain("คุณป้อง แสนสุข");
    expect(items.some((item) => item.source === "opening")).toBe(true);
    expect(items.some((item) => item.source === "alert")).toBe(true);
  });

  test("a sales rep keeps the agents to visit and gets nobody else's people", async () => {
    const feed = await landingFeedFor(accessOf("u_krit"), NOW);
    expect(feed.rows.some((row) => row.source === "visit")).toBe(true);
    expect(feed.rows.some((row) => row.source === "person" || row.source === "opening")).toBe(false);
  });
});

describe("what a user does with an item stays theirs", () => {
  test("done hides the item for the one who pressed it, not for others who share it", async () => {
    const opening = (await feedFor(accessOf("u_may"), NOW)).find((item) => item.source === "opening");
    if (!opening) throw new Error("no opening on HR's feed");
    expect(await actOnFeedItem(accessOf("u_may"), opening.key, "done", NOW)).toEqual({ ok: true });
    expect((await feedFor(accessOf("u_may"), NOW)).some((item) => item.key === opening.key)).toBe(false);
    expect((await feedFor(accessOf("u_anucha"), NOW)).some((item) => item.key === opening.key)).toBe(true);
  });

  test("snooze hides for seven days, then the item is back", async () => {
    const [first] = await feedFor(accessOf("u_may"), NOW);
    await actOnFeedItem(accessOf("u_may"), first.key, "snooze", NOW);
    expect((await feedFor(accessOf("u_may"), NOW + 6 * DAY_MS)).some((item) => item.key === first.key)).toBe(false);
    expect((await feedFor(accessOf("u_may"), NOW + 8 * DAY_MS)).some((item) => item.key === first.key)).toBe(true);
  });

  test("an item outside the user's feed does not exist for them, and a handoff is finished only in the inbox", async () => {
    const opening = (await feedFor(accessOf("u_may"), NOW)).find((item) => item.source === "opening");
    expect(await actOnFeedItem(accessOf("u_krit"), opening?.key ?? "", "done", NOW)).toEqual({ ok: false, status: 404 });
    for (const user of USERS) {
      const packet = (await feedFor(accessOf(user.id), NOW)).find((item) => item.source === "packet");
      if (!packet) continue;
      expect(await actOnFeedItem(accessOf(user.id), packet.key, "done", NOW)).toEqual({ ok: false, status: 400 });
      return;
    }
  });

  test("opening an item is recorded without changing the question chips", async () => {
    const access = accessOf("u_may");
    const before = quickActionsFor(access).map((action) => action.id);
    const [first] = await feedFor(access, NOW);
    await actOnFeedItem(access, first.key, "open", NOW);
    expect(quickActionsFor(access).map((action) => action.id)).toEqual(before);
    expect((await feedFor(access, NOW)).some((item) => item.key === first.key)).toBe(true);
  });
});
