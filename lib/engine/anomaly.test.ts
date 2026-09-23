import { describe, expect, test } from "bun:test";
import type { Alert, Dim } from "@/lib/contracts";
import { toneOf } from "@/lib/dashboard/metric-display";
import { INJECTED_ANOMALIES } from "@/lib/data/anomalies";
import { TH } from "@/lib/i18n/th";
import { Z_OPEN, detectAnomalies, dropRollUps, mergeAgentStories, severityOf, thresholdFor, thresholdKey, toAlert, type Detection } from "./anomaly";
import { DAILY_SCAN, scanSeries } from "./stats";

const DETECTED = detectAnomalies();

type Matcher = { id: string; direction: "up" | "down"; match: (detection: Detection) => boolean };

const MATCHERS: Matcher[] = [
  {
    id: "anom_rungrueang_leo620",
    direction: "down",
    match: (detection) => detection.dims.agent === "ag_nea_07" && detection.dims.sku === "sku_leo_bottle620",
  },
  {
    id: "anom_purra_pm25_north",
    direction: "up",
    match: (detection) => detection.dims.sku === "sku_purra_pet600" && ["pv_chiangmai", "pv_lamphun"].includes(detection.dims.province ?? ""),
  },
  {
    id: "anom_lamphun_purra_cover",
    direction: "down",
    match: (detection) => detection.metric === "days_of_cover" && detection.dims.dc === "dc_lamphun" && detection.dims.sku === "sku_purra_pet600",
  },
  {
    id: "anom_northeast_silent_agents",
    direction: "down",
    match: (detection) => ["ag_nea_02", "ag_nea_05"].includes(detection.dims.agent ?? "") && detection.metric === "net_sales_volume",
  },
  {
    id: "anom_cstore_soda_promo",
    direction: "up",
    match: (detection) => detection.dims.sku === "sku_singha_soda_can320" && detection.dims.channel === "modern_trade",
  },
  {
    id: "anom_south_ar_overdue",
    direction: "up",
    match: (detection) => detection.metric === "ar_overdue" && detection.dims.region === "south",
  },
  {
    id: "anom_khonkaen_line2",
    direction: "down",
    match: (detection) => detection.metric === "production_output" && detection.dims.plant === "pl_khonkaen",
  },
];

function hits(matcher: Matcher): Detection[] {
  return DETECTED.filter((detection) => detection.direction === matcher.direction && matcher.match(detection));
}

describe("anomaly detection", () => {
  test("every injected anomaly has a matcher", () => {
    expect(MATCHERS.map((matcher) => matcher.id).sort()).toEqual(INJECTED_ANOMALIES.map((anomaly) => anomaly.id).sort());
  });

  for (const matcher of MATCHERS) {
    test(`finds ${matcher.id} going ${matcher.direction}`, () => {
      const found = hits(matcher);
      expect(found.length).toBeGreaterThan(0);
      const [first] = found;
      expect(first.hypothesis.length).toBeGreaterThan(10);
      expect(first.verifySteps).toHaveLength(2);
      expect(first.ownerUserId).not.toBe("");
      expect(first.window.from <= first.window.to).toBe(true);
    });
  }

  test("the promotion driven spike is labelled as explained, not as a fault", () => {
    const promo = hits(MATCHERS[4] as Matcher);
    expect(promo.some((detection) => detection.explained)).toBe(true);
    const explained = promo.find((detection) => detection.explained) as Detection;
    expect(explained.hypothesis).toContain(TH.engine.promoTag);
    expect(explained.severity).toBe("P3");
  });

  test("the detected window covers the injected window of the Khon Kaen outage", () => {
    const [outage] = hits(MATCHERS[6] as Matcher);
    const injected = INJECTED_ANOMALIES.find((anomaly) => anomaly.id === "anom_khonkaen_line2");
    expect(outage.window.from <= (injected?.window.to as string)).toBe(true);
    expect(outage.window.to >= (injected?.window.from as string)).toBe(true);
  });

  test("every alert stays inside the alert contract and carries a scope", () => {
    for (const detection of DETECTED) {
      expect(["P1", "P2", "P3"]).toContain(detection.severity);
      expect(Object.keys(detection.dims).length).toBeGreaterThan(0);
      expect(Number.isFinite(detection.zScore)).toBe(true);
    }
  });

  test("detection is deterministic", () => {
    expect(detectAnomalies().map((detection) => detection.id)).toEqual(DETECTED.map((detection) => detection.id));
  });

  test("a roll-up is dropped when a deeper slice explains the same move", () => {
    const base = { metric: "net_sales_volume" as const, direction: "down" as const, severity: "P1" as const };
    const coarse = { ...base, id: "coarse", dims: { region: "northeast" } as Partial<Record<Dim, string>> } as Detection;
    const fine = { ...base, id: "fine", dims: { region: "northeast", agent: "ag_nea_02" } as Partial<Record<Dim, string>> } as Detection;
    expect(dropRollUps([coarse, fine]).map((detection) => detection.id)).toEqual(["fine"]);
  });

  test("one agent falling across brands is one alert, not one per brand", () => {
    const northeastAgentDrops = DETECTED.filter(
      (detection) => detection.dims.region === "northeast" && detection.metric === "net_sales_volume" && detection.direction === "down" && !detection.dims.sku,
    );
    const agents = northeastAgentDrops.map((detection) => detection.dims.agent);
    expect(new Set(agents).size).toBe(agents.length);
    expect(northeastAgentDrops.every((detection) => detection.dims.brand === undefined)).toBe(true);
  });

  test("merging keeps the worst severity and sums the brands", () => {
    const part = (brand: string, severity: Detection["severity"], observed: number): Detection => ({
      ...DETECTED[0],
      id: brand,
      metric: "net_sales_volume",
      direction: "down",
      dims: { agent: "ag_nea_05", brand, region: "northeast" },
      severity,
      observed,
      expected: 50,
    });
    const merged = mergeAgentStories([part("leo", "P2", 10), part("singha", "P1", 5)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].severity).toBe("P1");
    expect(merged[0].observed).toBe(15);
    expect(merged[0].expected).toBe(100);
    expect(merged[0].dims.brand).toBeUndefined();
  });

  test("three dismissals raise the bar for the same slice", () => {
    const key = thresholdKey("net_sales_volume", { region: "northeast" });
    expect(thresholdFor(key, {})).toBe(Z_OPEN);
    expect(thresholdFor(key, { [key]: 2 })).toBe(Z_OPEN);
    expect(thresholdFor(key, { [key]: 3 })).toBeGreaterThan(Z_OPEN);
  });

  test("a flat series with a step change is found, a flat one is not", () => {
    const season = Array.from({ length: 120 }, (_, index) => index % 7);
    const flat = Array.from({ length: 120 }, (_, index) => 100 + (index % 7) * 2);
    expect(Math.abs(scanSeries(flat, season, DAILY_SCAN)?.z ?? 0)).toBeLessThan(Z_OPEN);
    const stepped = flat.map((value, index) => (index >= 110 ? value * 0.5 : value));
    const scan = scanSeries(stepped, season, DAILY_SCAN);
    expect(scan?.direction).toBe("down");
    expect(Math.abs(scan?.z ?? 0)).toBeGreaterThan(Z_OPEN);
  });
});

describe("severity follows the harm, not the z-score", () => {
  const sales = { metric: "net_sales_volume" as const, lowThreshold: null };
  const overdue = { metric: "ar_overdue" as const, lowThreshold: null };
  const cover = { metric: "days_of_cover" as const, lowThreshold: 10 };

  test("a harmful quarter-sized gap is critical, a harmful tenth is worth a look", () => {
    expect(severityOf(sales, 20, 100)).toBe("P1");
    expect(severityOf(sales, 88, 100)).toBe("P2");
    expect(severityOf(sales, 95, 100)).toBe("P3");
    expect(severityOf(overdue, 170, 100)).toBe("P1");
  });

  test("good news is never critical, only big good news asks for planning", () => {
    expect(severityOf(sales, 114, 100)).toBe("P3");
    expect(severityOf(sales, 130, 100)).toBe("P2");
    expect(severityOf(overdue, 60, 100)).toBe("P2");
  });

  test("cover under a week is critical, under the floor is worth a look", () => {
    expect(severityOf(cover, 6.2, 12)).toBe("P1");
    expect(severityOf(cover, 8.5, 12)).toBe("P2");
  });

  test("the injected scenarios keep few criticals", () => {
    const critical = DETECTED.filter((detection) => detection.severity === "P1");
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.length).toBeLessThanOrEqual(10);
    for (const detection of critical.filter((entry) => entry.metric !== "days_of_cover")) {
      const gap = ((detection.observed - detection.expected) / Math.abs(detection.expected)) * 100;
      expect(toneOf(detection.metric, gap)).toBe("bad");
    }
  });
});

describe("a dismissed alert stays dismissed until it gets worse", () => {
  const detection = DETECTED[0] as Detection;

  test("same or milder severity keeps it closed at the severity it was closed at", () => {
    const dismissed: Alert = { ...toAlert(detection, null), status: "dismissed", severity: "P1", dismissCount: 1 };
    const rerun = toAlert({ ...detection, severity: "P1" }, dismissed);
    expect(rerun.status).toBe("dismissed");
    expect(toAlert({ ...detection, severity: "P3" }, dismissed).status).toBe("dismissed");
  });

  test("a worse severity opens it again", () => {
    const dismissed: Alert = { ...toAlert(detection, null), status: "dismissed", severity: "P3", dismissCount: 1 };
    const rerun = toAlert({ ...detection, severity: "P1" }, dismissed);
    expect(rerun.status).toBe("open");
    expect(rerun.severity).toBe("P1");
  });
});
