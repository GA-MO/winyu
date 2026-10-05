import { describe, expect, test } from "bun:test";
import { dueTimeTh, timeOfDay } from "./format";

describe("timeOfDay", () => {
  test("reads the hour in Thai time, not the server's timezone", () => {
    expect(timeOfDay(new Date("2026-09-23T01:30:00Z"))).toBe("morning");
    expect(timeOfDay(new Date("2026-09-23T04:59:00Z"))).toBe("morning");
    expect(timeOfDay(new Date("2026-09-23T05:00:00Z"))).toBe("afternoon");
    expect(timeOfDay(new Date("2026-09-23T09:00:00Z"))).toBe("evening");
    expect(timeOfDay(new Date("2026-09-23T13:00:00Z"))).toBe("night");
    expect(timeOfDay(new Date("2026-09-22T21:30:00Z"))).toBe("night");
    expect(timeOfDay(new Date("2026-09-22T22:00:00Z"))).toBe("morning");
  });
});

describe("dueTimeTh", () => {
  const NOW = new Date("2026-09-24T10:00:00Z");

  test("a deadline ahead counts down instead of reading as just now", () => {
    expect(dueTimeTh("2026-09-27T10:00:00Z", NOW)).toBe("อีก 3 วัน");
    expect(dueTimeTh("2026-09-24T14:00:00Z", NOW)).toBe("อีก 4 ชั่วโมง");
  });

  test("a passed deadline says how late it is", () => {
    expect(dueTimeTh("2026-09-24T09:30:00Z", NOW)).toBe("เลยกำหนด 30 นาที");
  });
});
