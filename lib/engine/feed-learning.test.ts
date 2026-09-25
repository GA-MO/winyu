import { describe, expect, test } from "bun:test";
import type { ActionEvent, FeedItem } from "@/lib/contracts";
import { feedIntentKey, kindLabel, learnFeed, mutesOfKind, notFollowingStatement } from "./feed-learning";

const NOW = Date.parse("2026-09-25T09:00:00.000Z");
const DAY_MS = 86_400_000;

function item(key: string, kind: string, rank: number): FeedItem {
  return { key, source: "person", kind, story: null, rank, tone: "warning", label: key, reason: "", detail: null, prompt: "", alertId: null, packetId: null, canFinish: true, actions: [], because: null };
}

function event(kind: ActionEvent["kind"], itemKind: string, key: string, daysAgo = 1): ActionEvent {
  return { id: `${kind}-${key}-${daysAgo}`, userId: "u_x", at: new Date(NOW - daysAgo * DAY_MS).toISOString(), kind, intentKey: feedIntentKey(itemKind, key), metric: null, dims: [], prompt: null, threadId: null };
}

const CERT = item("person:a:cert", "person:cert", 450);
const OVERTIME = item("person:b:overtime", "person:overtime", 470);
const OPENING = item("opening:c", "opening", 460);
const NOTHING = { events: [], seenCounts: {}, mutedKinds: new Set<string>(), now: NOW };

describe("the feed as the user reads it", () => {
  test("with no behaviour the rules' order stands and nothing claims a reason", () => {
    const learned = learnFeed([CERT, OVERTIME, OPENING], NOTHING);
    expect(learned.map((entry) => entry.key)).toEqual([OVERTIME.key, OPENING.key, CERT.key]);
    expect(learned.every((entry) => entry.because === null)).toBe(true);
  });

  test("a kind the user keeps opening rises and says why", () => {
    const events = [event("feed_open", "person:cert", "x1"), event("feed_open", "person:cert", "x2"), event("feed_done", "person:cert", "x3"), event("feed_open", "opening", "x4")];
    const [first] = learnFeed([CERT, OVERTIME, OPENING], { ...NOTHING, events });
    expect(first.key).toBe(CERT.key);
    expect(first.because).toBe("ขึ้นก่อนเพราะคุณเปิดเรื่องใบอนุญาตใกล้หมด 3 ครั้งใน 30 วัน");
  });

  test("opening fewer than three things in a month teaches nothing yet", () => {
    const events = [event("feed_open", "person:cert", "x1"), event("feed_open", "person:cert", "x2")];
    expect(learnFeed([CERT, OVERTIME, OPENING], { ...NOTHING, events })[0].key).toBe(OVERTIME.key);
  });

  test("a kind the user puts off sinks, and behaviour older than a month is forgotten", () => {
    const recent = [event("feed_snooze", "person:overtime", "y1"), event("feed_mute", "person:overtime", "y2")];
    expect(learnFeed([CERT, OVERTIME, OPENING], { ...NOTHING, events: recent }).at(-1)?.key).toBe(OVERTIME.key);
    const old = recent.map((entry, index) => ({ ...entry, id: `old-${index}`, at: new Date(NOW - 40 * DAY_MS).toISOString() }));
    expect(learnFeed([CERT, OVERTIME, OPENING], { ...NOTHING, events: old })[0].key).toBe(OVERTIME.key);
  });

  test("an item seen on three visits and never opened drops below the rest", () => {
    const learned = learnFeed([CERT, OVERTIME, OPENING], { ...NOTHING, seenCounts: { [OVERTIME.key]: 3 } });
    expect(learned.at(-1)?.key).toBe(OVERTIME.key);
    const opened = learnFeed([CERT, OVERTIME, OPENING], { ...NOTHING, seenCounts: { [OVERTIME.key]: 3 }, events: [event("feed_open", "person:overtime", OVERTIME.key)] });
    expect(opened[0].key).toBe(OVERTIME.key);
  });

  test("a kind the user stopped following is gone, and the statement is the one memory stores", () => {
    const learned = learnFeed([CERT, OVERTIME, OPENING], { ...NOTHING, mutedKinds: new Set(["person:overtime"]) });
    expect(learned.map((entry) => entry.key)).not.toContain(OVERTIME.key);
    expect(notFollowingStatement("person:overtime")).toBe(`ไม่ติดตาม${kindLabel("person:overtime")}`);
  });

  test("mutes are counted per kind within the month", () => {
    const events = [event("feed_mute", "opening", "a"), event("feed_mute", "opening", "b"), event("feed_mute", "visit", "c"), event("feed_mute", "opening", "d", 45)];
    expect(mutesOfKind(events, "opening", NOW)).toBe(2);
  });
});

describe("the reason a kind rose", () => {
  test("is said on its first item only", () => {
    const second = item("person:d:cert", "person:cert", 440);
    const events = [event("feed_open", "person:cert", "x1"), event("feed_open", "person:cert", "x2"), event("feed_open", "person:cert", "x3")];
    const learned = learnFeed([CERT, second, OVERTIME], { ...NOTHING, events });
    expect(learned.filter((entry) => entry.because !== null).map((entry) => entry.key)).toEqual([CERT.key]);
  });
});

describe("kind names in sentences", () => {
  test("an alert kind reads as the metric's plain name", () => {
    expect(kindLabel("alert:net_sales_volume")).not.toContain("(");
    expect(kindLabel("person:cert")).toBe("ใบอนุญาตใกล้หมด");
  });
});
