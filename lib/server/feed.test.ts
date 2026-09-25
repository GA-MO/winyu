import { afterEach, describe, expect, test } from "bun:test";
import type { AccessContext, FeedItem, PersonalWatch } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { EMPLOYEES } from "@/lib/data/entities/people";
import { USERS, findUser } from "@/lib/data/entities/users";
import { actionEvents, feedStates, memoryFacts, packets, personalWatches, staffRequests } from "@/lib/server/agent/collections";
import { confirmMemory } from "@/lib/engine/memory";
import { enrollCourse } from "./courses";
import { actOnFeedItem, feedFor, landingFeedFor } from "./feed";
import { quickActionsFor } from "./quick-actions";
import { ensureFeedHistory } from "./demo-feed-history";

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
      for (const item of items.filter((candidate) => candidate.source === "person" && candidate.kind !== "own:cert")) {
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

  test("a sales rep keeps the agents to visit and gets nobody else's people, only their own licence", async () => {
    const feed = await landingFeedFor(accessOf("u_krit"), NOW);
    expect(feed.rows.some((row) => row.source === "visit")).toBe(true);
    expect(feed.rows.some((row) => (row.source === "person" && row.kind !== "own:cert") || row.source === "opening")).toBe(false);
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

describe("each matter offers the one thing to do about it", () => {
  test("a licence goes to the holder's manager when the manager uses Cop, else to the holder, else nowhere", async () => {
    const hr = await feedFor(accessOf("u_may"), NOW);
    const pong = hr.find((item) => item.label === "คุณป้อง แสนสุข");
    expect(pong?.actions[0]).toMatchObject({ kind: "handoff", tool: "create_handoff", label: "ส่งให้คุณอนุชา พรหมศรี" });
    expect(pong?.actions[0]?.input).toMatchObject({ toUserId: "u_anucha", urgency: "medium" });
    expect(hr.find((item) => item.label === "คุณแดง ศักดิ์ดี")?.actions).toEqual([]);
    const rsm = await feedFor(accessOf("u_anucha"), NOW);
    expect(rsm.find((item) => item.label === "คุณกฤต จันทร์เสน")?.actions[0]).toMatchObject({ label: "แจ้งคุณกฤต จันทร์เสน", input: { toUserId: "u_krit" } });
  });

  test("a user's own licence is on their feed with the renewal round to book", async () => {
    const own = (await feedFor(accessOf("u_krit"), NOW)).find((item) => item.kind === "own:cert");
    expect(own).toMatchObject({ label: "ใบอนุญาตขายสุราของคุณ", reason: "เหลือ 23 วัน" });
    expect(own?.actions[0]).toMatchObject({ kind: "enroll", tool: "enroll_course", input: { courseId: "crs_sales_licence" } });
  });

  test("once the holder books a renewal round, the licence leaves every feed", async () => {
    const before = new Set(staffRequests().all().map((request) => request.id));
    const packetsBefore = new Set(packets().all().map((packet) => packet.id));
    const booked = await enrollCourse(accessOf("u_krit"), "crs_sales_licence", null);
    expect(booked.ok).toBe(true);
    try {
      expect((await feedFor(accessOf("u_krit"), NOW)).some((item) => item.kind === "own:cert")).toBe(false);
      expect((await feedFor(accessOf("u_anucha"), NOW)).some((item) => item.label === "คุณกฤต จันทร์เสน")).toBe(false);
      expect((await feedFor(accessOf("u_may"), NOW)).some((item) => item.label === "คุณกฤต จันทร์เสน")).toBe(false);
    } finally {
      for (const request of staffRequests().all()) if (!before.has(request.id)) staffRequests().remove(request.id);
      for (const packet of packets().all()) if (!packetsBefore.has(packet.id)) packets().remove(packet.id);
    }
  });
});

describe("buttons follow the tools a user may run", () => {
  test("with handoffs switched off, no item offers to send work", async () => {
    const hr = accessOf("u_may");
    const closed = { ...hr, toolAllow: hr.toolAllow.filter((name) => name !== "create_handoff") };
    const items = await feedFor(closed, NOW);
    expect(items.some((item) => item.actions.some((action) => action.tool === "create_handoff"))).toBe(false);
  });
});

describe("what Cop learns from the feed changes the feed", () => {
  test("three 'not mine' on licences proposes stopping them; once confirmed they are gone", async () => {
    const hr = accessOf("u_may");
    const factsBefore = new Set(memoryFacts().all().map((fact) => fact.id));
    const eventsBefore = new Set(actionEvents().all().map((entry) => entry.id));
    try {
      const licences = (await feedFor(hr, NOW)).filter((item) => item.kind === "person:cert").slice(0, 3);
      expect(licences).toHaveLength(3);
      for (const licence of licences) await actOnFeedItem(hr, licence.key, "mute", NOW);
      const proposal = memoryFacts().all().find((fact) => !factsBefore.has(fact.id) && fact.value === "ไม่ติดตามใบอนุญาตใกล้หมด");
      expect(proposal).toBeDefined();
      expect((await feedFor(hr, NOW)).some((item) => item.kind === "person:cert")).toBe(true);
      confirmMemory("u_may", proposal?.id ?? "");
      expect((await feedFor(hr, NOW)).some((item) => item.kind === "person:cert")).toBe(false);
    } finally {
      for (const fact of memoryFacts().all()) if (!factsBefore.has(fact.id)) memoryFacts().remove(fact.id);
      for (const entry of actionEvents().all()) if (!eventsBefore.has(entry.id)) actionEvents().remove(entry.id);
    }
  });

  test("a watch the user set that crossed its line is on their feed", async () => {
    const watch: PersonalWatch = {
      id: "w_test_attrition",
      userId: "u_may",
      title: "อัตราการลาออกฝ่ายขาย",
      query: { metric: "attrition_rate", dims: [], filters: { department: ["dept_sales"] }, range: { from: "2026-08-01", to: "2026-08-31" }, grain: "month", compare: "none", limit: null },
      windowDays: 30,
      condition: { kind: "above", value: 1.2 },
      createdAt: "2026-09-20T00:00:00.000Z",
      state: "triggered",
      lastCheckedAt: "2026-09-25T00:00:00.000Z",
      lastTriggeredAt: "2026-09-25T00:00:00.000Z",
    };
    personalWatches().put(watch);
    try {
      const found = (await feedFor(accessOf("u_may"), NOW)).find((item) => item.source === "watch");
      expect(found).toMatchObject({ label: "อัตราการลาออกฝ่ายขาย", tone: "danger", kind: "watch:attrition_rate" });
    } finally {
      personalWatches().remove(watch.id);
    }
  });
});

describe("the demo's reading habits", () => {
  test("are added once, and HR's licences then lead with the reason they rose", async () => {
    const seeded = actionEvents().all().filter((entry) => entry.id.startsWith("ev_demo_feed"));
    for (const entry of seeded) actionEvents().remove(entry.id);
    const eventsBefore = new Set(actionEvents().all().map((entry) => entry.id));
    try {
      const first = await ensureFeedHistory(NOW);
      expect(first).toBeGreaterThan(0);
      expect(await ensureFeedHistory(NOW)).toBe(0);
      const [top] = await feedFor(accessOf("u_may"), NOW);
      expect(top.kind).toBe("person:cert");
      expect(top.because).toContain("ใบอนุญาตใกล้หมด");
      const rsm = await feedFor(accessOf("u_anucha"), NOW);
      expect(rsm.some((item) => item.source === "alert" && item.because !== null)).toBe(true);
    } finally {
      for (const entry of actionEvents().all()) if (!eventsBefore.has(entry.id)) actionEvents().remove(entry.id);
      for (const entry of seeded) actionEvents().put(entry);
    }
  });
});
