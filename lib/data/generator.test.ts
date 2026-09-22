import { describe, expect, test } from "bun:test";
import { DAY_COUNT, toDayIndex } from "./dates";
import { buildSalesCube, AGENT_COUNT, SKU_COUNT, SKU_HL_PER_CASE, cubeIndex } from "./generator";
import { salesCube, productionTables, inventoryTables, financeTables, hrTables } from "./cache";
import { hashNoise, mulberry32 } from "./random";
import { SKUS } from "./entities/products";
import { AGENTS } from "./entities/agents";
import { isBuddhistLent, isHoliday, toBuddhistYear, weekOf } from "./entities/calendar";
import { pm25On } from "./entities/external";
import { PM25_SPIKE_DAYS } from "./entities/external";

const CUBE_BUDGET_MS = 2000;

function totalHl(cases: Float64Array): number {
  let total = 0;
  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    const factor = SKU_HL_PER_CASE[skuIdx];
    const start = cubeIndex(skuIdx, 0, 0);
    const end = start + AGENT_COUNT * DAY_COUNT;
    for (let index = start; index < end; index += 1) total += cases[index] * factor;
  }
  return total;
}

function rangeHl(cases: Float64Array, skuIds: string[], from: string, to: string): number {
  const fromDay = toDayIndex(from);
  const toDay = toDayIndex(to);
  let total = 0;
  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    if (skuIds.length > 0 && !skuIds.includes(SKUS[skuIdx].id)) continue;
    const factor = SKU_HL_PER_CASE[skuIdx];
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const start = cubeIndex(skuIdx, agentIdx, 0);
      for (let dayIdx = fromDay; dayIdx <= toDay; dayIdx += 1) total += cases[start + dayIdx] * factor;
    }
  }
  return total;
}

function skusOfUnit(unit: "beer" | "soft"): string[] {
  const beerBrands = ["singha", "leo", "asahi", "carlsberg"];
  return SKUS.filter((sku) => (unit === "beer" ? beerBrands.includes(sku.brand) : !beerBrands.includes(sku.brand))).map((sku) => sku.id);
}

describe("random", () => {
  test("mulberry32 is stable for a seed", () => {
    const first = Array.from({ length: 5 }, mulberry32(20260922));
    const second = Array.from({ length: 5 }, mulberry32(20260922));
    expect(first).toEqual(second);
  });

  test("hashNoise is stable per key tuple and spread over 0..1", () => {
    expect(hashNoise("leo", 3, "x")).toBe(hashNoise("leo", 3, "x"));
    expect(hashNoise("leo", 3, "x")).not.toBe(hashNoise("leo", 4, "x"));
    const samples = Array.from({ length: 500 }, (_, index) => hashNoise("sample", index));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.05);
  });
});

describe("calendar", () => {
  test("Buddhist year, holidays, lent windows and week keys", () => {
    expect(toBuddhistYear(2026)).toBe(2569);
    expect(isHoliday("2026-04-13")).toBe(true);
    expect(isHoliday("2026-04-17")).toBe(false);
    expect(isBuddhistLent("2025-07-11")).toBe(true);
    expect(isBuddhistLent("2025-10-07")).toBe(true);
    expect(isBuddhistLent("2025-10-08")).toBe(false);
    expect(isBuddhistLent("2026-06-30")).toBe(true);
    expect(isBuddhistLent("2026-09-26")).toBe(true);
    expect(weekOf("2026-09-22")).toBe("2026-W39");
  });
});

describe("external data", () => {
  test("PM2.5 is high in the north during Jan–Apr and spikes in the last six days", () => {
    const january = pm25On("pv_chiangmai", toDayIndex("2026-02-15"));
    const august = pm25On("pv_chiangmai", toDayIndex("2026-08-15"));
    expect(january).toBeGreaterThan(august * 2);
    const spike = pm25On("pv_lamphun", DAY_COUNT - 1);
    const beforeSpike = pm25On("pv_lamphun", DAY_COUNT - PM25_SPIKE_DAYS - 3);
    expect(spike).toBeGreaterThan(beforeSpike * 1.8);
    expect(pm25On("pv_phitsanulok", DAY_COUNT - 1)).toBeLessThan(spike);
  });
});

describe("sales cube", () => {
  test("two builds produce identical totals", () => {
    const first = buildSalesCube();
    const second = buildSalesCube();
    expect(totalHl(first.sellInCases)).toBe(totalHl(second.sellInCases));
    expect(totalHl(first.sellOutCases)).toBe(totalHl(second.sellOutCases));
    const index = cubeIndex(7, 13, 401);
    expect(first.sellInCases[index]).toBe(second.sellInCases[index]);
    expect(first.targetCases[3]).toBe(second.targetCases[3]);
  });

  test("builds the whole cube well inside the time budget", () => {
    const started = performance.now();
    buildSalesCube();
    expect(performance.now() - started).toBeLessThan(CUBE_BUDGET_MS);
  });

  test("sell-out tracks sell-in within a few percent nationally", () => {
    const cube = salesCube();
    const sellIn = totalHl(cube.sellInCases);
    const sellOut = totalHl(cube.sellOutCases);
    expect(Math.abs(sellOut / sellIn - 1)).toBeLessThan(0.05);
  });

  test("beer peaks in April and dips in July", () => {
    const cube = salesCube();
    const beer = skusOfUnit("beer");
    const april = rangeHl(cube.sellInCases, beer, "2026-04-01", "2026-04-30");
    const july = rangeHl(cube.sellInCases, beer, "2026-07-01", "2026-07-31");
    expect(april).toBeGreaterThan(july);
  });

  test("soda and water peak between March and May", () => {
    const cube = salesCube();
    const soft = skusOfUnit("soft");
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
    const perDay = months.map((month) => {
      const end = month === "2026-02" ? `${month}-28` : `${month}-28`;
      return { month, value: rangeHl(cube.sellInCases, soft, `${month}-01`, end) };
    });
    const ranked = [...perDay].sort((left, right) => right.value - left.value).slice(0, 3).map((entry) => entry.month);
    expect(ranked.sort()).toEqual(["2026-03", "2026-04", "2026-05"]);
  });

  test("every agent and sku carries volume", () => {
    const cube = salesCube();
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const start = cubeIndex(0, agentIdx, 0);
      expect(cube.sellInCases[start + 200]).toBeGreaterThan(0);
    }
    expect(AGENTS.length).toBe(40);
    expect(SKUS.length).toBeGreaterThanOrEqual(28);
  });
});

describe("derived fact tables", () => {
  test("production, inventory, finance and hr tables are populated", () => {
    const production = productionTables();
    const inventory = inventoryTables();
    const finance = financeTables();
    const hr = hrTables();
    expect(production.outputHl.some((value) => value > 0)).toBe(true);
    expect(inventory.stockCases.some((value) => value > 0)).toBe(true);
    expect(finance.revenueThb.some((value) => value > 0)).toBe(true);
    expect(hr.headcount[0]).toBeGreaterThan(0);
    expect(hr.avgSalaryThb[0]).toBeGreaterThan(0);
  });
});
