import { describe, expect, test } from "bun:test";
import { timeOfDay } from "./format";

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
