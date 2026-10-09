import { describe, expect, test } from "bun:test";
import { BACKTEST_WEEKS, HORIZON_WEEKS, backtest, buildForecasts, weeklySeriesFor } from "./forecast";

const FORECASTS = await buildForecasts();
const VOLUME = FORECASTS.filter((forecast) => forecast.metric === "net_sales_volume");
const MAPE_TARGET = 15;
const COVERAGE = 0.8;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

describe("forecast", () => {
  test("every brand and region slice gets an eight week horizon", () => {
    expect(VOLUME.length).toBeGreaterThan(20);
    for (const forecast of VOLUME) {
      expect(forecast.points).toHaveLength(HORIZON_WEEKS);
      expect(forecast.method).toBe("holt_winters");
      expect(forecast.horizon.from < forecast.horizon.to).toBe(true);
    }
  });

  test("the band widens with the horizon and never goes negative", () => {
    for (const forecast of VOLUME) {
      const [first] = forecast.points;
      const last = forecast.points[forecast.points.length - 1];
      expect(first.lo).toBeLessThanOrEqual(first.value);
      expect(first.hi).toBeGreaterThanOrEqual(first.value);
      expect(last.hi - last.lo).toBeGreaterThan(first.hi - first.lo);
      expect(first.lo).toBeGreaterThanOrEqual(0);
    }
  });

  test("the twelve week backtest keeps volume MAPE under fifteen percent", () => {
    const mapes = VOLUME.map((forecast) => forecast.mape);
    expect(median(mapes)).toBeLessThan(MAPE_TARGET);
    const good = mapes.filter((mape) => mape < MAPE_TARGET).length;
    expect(good / mapes.length).toBeGreaterThanOrEqual(COVERAGE);
  });

  test("a clean seasonal series is forecast almost exactly", () => {
    const values = Array.from({ length: 80 }, (_, index) => 1000 + 200 * Math.sin((2 * Math.PI * index) / 52));
    const mape = backtest(values, 52, BACKTEST_WEEKS);
    expect(mape).not.toBeNull();
    expect(mape as number).toBeLessThan(5);
  });

  test("days of cover forecasts exist for every distribution centre", () => {
    const cover = FORECASTS.filter((forecast) => forecast.metric === "days_of_cover");
    expect(new Set(cover.map((forecast) => forecast.dims.dc)).size).toBeGreaterThan(5);
    for (const forecast of cover) expect(forecast.mape).toBeGreaterThan(0);
  });

  test("the weekly series drops the incomplete current week", async () => {
    const { keys } = await weeklySeriesFor("net_sales_volume", { brand: "leo", region: "northeast" });
    expect(keys[keys.length - 1]).toBe("2026-W38");
  });

  test("forecasting is deterministic", async () => {
    expect((await buildForecasts()).map((forecast) => forecast.points[0].value)).toEqual(FORECASTS.map((forecast) => forecast.points[0].value));
  });
});

describe("the engines read the warehouse through the metrics port", () => {
  test("a forecast run asks whatever metrics port is installed, not the generator directly", async () => {
    const { ports, registerPorts, resetPorts } = await import("@/lib/server/ports");
    const generator = ports().metrics;
    let asked = 0;
    registerPorts({ metrics: { ...generator, readFacts: (requests) => {
      asked += requests.length;
      return generator.readFacts(requests);
    } } });
    try {
      await weeklySeriesFor("net_sales_volume", { brand: "leo", region: "northeast" });
    } finally {
      resetPorts();
    }
    expect(asked).toBeGreaterThan(0);
  });
});
