import { describe, expect, test } from "bun:test";
import type { DraftStory } from "@/lib/contracts";
import { breakDownGap, formatShare, projectMonthEnd } from "./gap";
import { honestChecks } from "./check-verdict";
import { withOwner } from "./story-owner";

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

describe("withOwner", () => {
  const draft: DraftStory = {
    kind: "urgent",
    claim: "อีสานจะหลุดเป้า",
    scope: "ภาคอีสาน",
    period: "1–22 ก.ย. 2569",
    subject: { metric: "net_sales_volume", region: "northeast" },
    headline: { label: "เทียบเป้า", value: "93.3%", tone: "bad" },
    projection: null,
    causes: [],
    checked: [],
    recommendation: null,
  };

  test("the director sees the region's sales manager as owner, and the story stays as urgent as it is", () => {
    const story = withOwner(draft, "u_prasit", "s1");
    expect(story.kind).toBe("urgent");
    expect(story.owner?.userId).toBe("u_anucha");
  });

  test("the owner sees no owner line", () => {
    expect(withOwner(draft, "u_anucha", "s1").owner).toBeNull();
  });

  test("a story about people has no metric owner and stays as drafted", () => {
    const story = withOwner({ ...draft, subject: { metric: null, region: null } }, "u_may", "s1");
    expect(story.kind).toBe("urgent");
    expect(story.owner).toBeNull();
  });
});

describe("withOwner on a national subject", () => {
  test("a national sales story has no regional owner", () => {
    const national: DraftStory = { kind: "watch", claim: "ยอดทั้งประเทศ", scope: "ทั้งประเทศ", period: "ก.ย.", subject: { metric: "net_sales_value", region: null }, headline: { label: "เทียบเป้า", value: "99.8%", tone: "neutral" }, projection: null, causes: [], checked: [], recommendation: null };
    expect(withOwner(national, "u_thana", "s1").owner).toBeNull();
  });
});

describe("honestChecks", () => {
  const base: DraftStory = { kind: "urgent", claim: "c", scope: "s", period: "p", subject: { metric: null, region: null }, headline: { label: "l", value: "v", tone: null }, projection: null, causes: [], recommendation: null, checked: [] };

  test("a confirmation resting on a memory note or on no tool becomes likely; a ruling-out without a tool becomes unknown", () => {
    const draft = { ...base, checked: [
      { text: "ติดวงเงิน", verdict: "confirmed" as const, source: "recall_memory" },
      { text: "สต๊อกพอ", verdict: "ruled_out" as const, source: null },
      { text: "ขายออกปกติ", verdict: "ruled_out" as const, source: "query_metric" },
    ] };
    const verdicts = honestChecks(draft, new Set(["recall_memory", "query_metric"])).checked.map((check) => check.verdict);
    expect(verdicts).toEqual(["likely", "unknown", "ruled_out"]);
  });

  test("a tool the run never called does not count", () => {
    const draft = { ...base, checked: [{ text: "x", verdict: "confirmed" as const, source: "get_forecast" }] };
    expect(honestChecks(draft, new Set(["query_metric"])).checked[0].verdict).toBe("likely");
  });
});
