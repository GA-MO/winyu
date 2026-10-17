import { describe, expect, test } from "bun:test";
import { breakDownGap, fellHarder, formatShare, isBroad, mainCauses, projectMonthEnd } from "./gap";

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

  test("a gap no part explains a fifth of is broad; one part making half of it is not (AI-145)", () => {
    const even = Array.from({ length: 7 }, (_, index) => ({ label: `p${index}`, value: 90, compare: 100 }));
    expect(isBroad(breakDownGap({ label: "all", value: 630, compare: 700 }, even))).toBe(true);
    const total = { label: "ภาคอีสาน", value: 3_859_913, compare: 4_138_403 };
    const concentrated = [
      { label: "อีสานรุ่งโรจน์", value: 353_359, compare: 503_440 },
      { label: "อุบลศรีสุข", value: 330_361, compare: 477_585 },
    ];
    expect(isBroad(breakDownGap(total, concentrated))).toBe(false);
    expect(isBroad(breakDownGap({ label: "all", value: 100, compare: 100 }, []))).toBe(false);
  });

  test("the main cause is one part that clearly leads, or parts about equal that together make most of the gap; two equal parts making under half of it are no main cause (AI-214)", () => {
    const shares = (...values: number[]) => values.map((share, index) => ({ label: `p${index}`, share }));
    expect(mainCauses(shares(0.781, 0.061)).map((part) => part.label)).toEqual(["p0"]);
    expect(mainCauses(shares(0.539, 0.529)).map((part) => part.label)).toEqual(["p0", "p1"]);
    expect(mainCauses(shares(0.23, 0.229, 0.154, 0.135, 0.133))).toEqual([]);
    expect(mainCauses(shares(0.15, 0.12))).toEqual([]);
    expect(mainCauses(shares(0.3, 0.2))).toEqual([shares(0.3)[0]]);
    expect(mainCauses([])).toEqual([]);
  });

  test("a part fell harder than the whole when it made a fifth of the gap and fell at least half again as much as the whole, in percent; a drop every part shares names none (AI-214)", () => {
    const whole = { label: "all", value: 248, compare: 274 };
    const even = [
      { label: "โมเดิร์นเทรด", value: 88.3, compare: 97.4 },
      { label: "ร้านค้าปลีกดั้งเดิม", value: 78.3, compare: 86.3 },
      { label: "ร้านอาหาร", value: 74.4, compare: 82.2 },
    ];
    expect(fellHarder(whole, even)).toEqual([]);
    const oneHit = [
      { label: "โมเดิร์นเทรด", value: 97.0, compare: 97.4 },
      { label: "ร้านค้าปลีกดั้งเดิม", value: 85.0, compare: 86.3 },
      { label: "ร้านอาหาร", value: 58.0, compare: 82.2 },
    ];
    expect(fellHarder(whole, oneHit).map((part) => part.label)).toEqual(["ร้านอาหาร"]);
    expect(fellHarder({ label: "all", value: 100, compare: 100 }, oneHit)).toEqual([]);
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

  test("says how much of the whole month's target is done so far and how much is left to reach it", () => {
    const projection = projectMonthEnd({ actual: 2_200, targetSoFar: 2_200, elapsedDays: 22, monthDays: 30, recentDailyAverage: 50 });
    expect(projection?.remaining).toBe(800);
    expect(projection?.attainmentToDate).toBeCloseTo(73.33, 1);
    expect(projectMonthEnd({ actual: 3_100, targetSoFar: 2_200, elapsedDays: 22, monthDays: 30, recentDailyAverage: 50 })?.remaining).toBe(0);
  });

  test("has nothing to say before a target exists", () => {
    expect(projectMonthEnd({ actual: 10, targetSoFar: 0, elapsedDays: 5, monthDays: 30, recentDailyAverage: 1 })).toBeNull();
  });
});
