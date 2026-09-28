import { describe, expect, test } from "bun:test";
import { breakDownGap, formatShare, projectMonthEnd } from "./gap";

describe("breakDownGap", () => {
  test("two parts that together exceed the whole gap each carry their own share, and parts above target offset", () => {
    const total = { label: "ภาคอีสาน", value: 3_859_913, compare: 4_138_403 };
    const parts = [
      { label: "อีสานรุ่งโรจน์", value: 353_359, compare: 503_440 },
      { label: "อุบลศรีสุข", value: 330_361, compare: 477_585 },
      { label: "โคราชสหภัณฑ์", value: 758_552, compare: 745_109 },
    ];
    const breakdown = breakDownGap(total, parts);
    expect(breakdown.gap).toBe(-278_490);
    expect(breakdown.contributors.map((part) => part.label)).toEqual(["อีสานรุ่งโรจน์", "อุบลศรีสุข"]);
    expect(formatShare(breakdown.contributors[0].share)).toBe("53.9%");
    expect(breakdown.offsetting.map((part) => part.label)).toEqual(["โคราชสหภัณฑ์"]);
    expect(breakdown.rest).toBeNull();
  });

  test("beyond five drivers the rest is summed into one line", () => {
    const parts = Array.from({ length: 7 }, (_, index) => ({ label: `p${index}`, value: 90, compare: 100 }));
    const breakdown = breakDownGap({ label: "all", value: 630, compare: 700 }, parts);
    expect(breakdown.contributors).toHaveLength(5);
    expect(breakdown.rest?.gap).toBe(-20);
  });
});

describe("projectMonthEnd", () => {
  test("carries the recent pace over the remaining days against an evenly spread month target", () => {
    const projection = projectMonthEnd({ actual: 2_200, targetSoFar: 2_200, elapsedDays: 22, monthDays: 30, recentDailyAverage: 50 });
    expect(projection?.projected).toBe(2_600);
    expect(projection?.monthTarget).toBe(3_000);
    expect(projection?.attainment).toBeCloseTo(86.67, 1);
  });

  test("has nothing to say before a target exists", () => {
    expect(projectMonthEnd({ actual: 10, targetSoFar: 0, elapsedDays: 5, monthDays: 30, recentDailyAverage: 1 })).toBeNull();
  });
});
