import { describe, expect, test } from "bun:test";
import type { MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { runMetric } from "@/lib/data/query";
import { findUser } from "@/lib/data/entities/users";
import { ALCOHOL_BAN_DATES, calendarEvents, isBuddhistLent } from "@/lib/data/entities/calendar";
import { detectAnomalies } from "./anomaly";
import { impactOf, type DailyBeer } from "./calendar-impact";
import { lentEffect } from "./series";

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };
const DETECTED = detectAnomalies();

function access(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return accessFor(user);
}

function shareQuery(dims: MetricQuery["dims"], filters: MetricQuery["filters"] = {}): MetricQuery {
  return { metric: "market_share", dims, filters, range: AUGUST, grain: "month", compare: "none", limit: 30 };
}

function beerOf(userId: string): DailyBeer {
  const scope = access(userId);
  return (metric, from, to) => {
    const result = runMetric({ metric, dims: ["date"], filters: { business_unit: ["beer"] }, range: { from, to }, grain: "day", compare: "none", limit: 60 }, scope);
    return result.ok ? new Map(result.rows.map((row) => [String(row.date), Number(row.value)])) : null;
  };
}

describe("beer market share", () => {
  test("without a maker the share is ours, and every maker adds up to 100%", () => {
    const ours = runMetric(shareQuery([]), access("u_thana"));
    const byMaker = runMetric(shareQuery(["maker"]), access("u_thana"));
    if (!ours.ok || !byMaker.ok) throw new Error("query failed");
    expect(ours.provenance.filtersApplied.maker).toEqual(["mk_boonrawd"]);
    const total = byMaker.rows.reduce((sum, row) => sum + Number(row.value), 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.5);
    expect(byMaker.headline.value).toBe(ours.headline.value);
  });

  test("a regional sales manager sees only their provinces and supply planning sees none", () => {
    const northeast = runMetric(shareQuery(["province"]), access("u_anucha"));
    if (!northeast.ok) throw new Error("query failed");
    expect(northeast.rows.length).toBe(4);
    expect(runMetric(shareQuery(["province"], { province: ["เชียงใหม่"] }), access("u_anucha")).ok).toBe(false);
    expect(runMetric(shareQuery(["province"]), access("u_wee")).ok).toBe(false);
  });

  test("Carabao's push in Nakhon Ratchasima raises a P1 for the Northeast sales manager, naming the rival in points", () => {
    const alert = DETECTED.find((detection) => detection.metric === "market_share" && detection.dims.province === "pv_nakhonratchasima");
    expect(alert?.direction).toBe("down");
    expect(alert?.severity).toBe("P1");
    expect(alert?.ownerUserId).toBe("u_anucha");
    expect(alert?.hypothesis).toContain("คาราบาว");
    expect(DETECTED.filter((detection) => detection.metric === "market_share").length).toBe(1);
  });
});

describe("no-sale days and Buddhist Lent", () => {
  test("2569 is an intercalary year: Lent runs 30 Jul – 26 Oct", () => {
    expect(isBuddhistLent("2026-07-29")).toBe(false);
    expect(isBuddhistLent("2026-10-26")).toBe(true);
    expect(ALCOHOL_BAN_DATES).toContain("2026-10-26");
  });

  test("the Lent step is measured from last year against water and soda, close to the true effect", () => {
    expect(lentEffect()).toBeGreaterThan(0.75);
    expect(lentEffect()).toBeLessThan(0.9);
  });

  test("the next no-sale day carries what the last one did, measured in the caller's scope", () => {
    const endOfLent = calendarEvents("2026-10-26", "2026-10-26").find((event) => event.kind === "alcohol_ban");
    if (!endOfLent) throw new Error("missing end of Lent");
    const impact = impactOf(endOfLent, beerOf("u_anucha"));
    expect(impact?.sellOutPercent).toBeLessThan(-80);
    expect(impact?.orderEvePercent).toBeGreaterThan(10);
    expect(impactOf(endOfLent, beerOf("u_may"))).toBeNull();
  });

  test("no daily sales alert starts on a no-sale day", () => {
    const daily = DETECTED.filter((detection) => detection.metric !== "market_share" && detection.metric !== "ar_overdue");
    expect(daily.some((detection) => ALCOHOL_BAN_DATES.includes(detection.window.from))).toBe(false);
  });
});
