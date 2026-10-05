import { describe, expect, test } from "bun:test";
import type { Forecast } from "@/lib/contracts";
import { forecastSlice } from "./forecast-slice";

function series(metric: Forecast["metric"], dims: Forecast["dims"], values: number[], mape: number): Forecast {
  return {
    id: `${metric}-${Object.values(dims).join("-")}`,
    metric,
    dims,
    horizon: { from: "2026-09-21", to: "2026-11-09" },
    points: values.map((value, index) => ({ date: `2026-09-${21 + index}`, value, lo: value - 1, hi: value + 1 })),
    mape,
    method: "holt_winters",
  };
}

const FORECASTS: Forecast[] = [
  series("net_sales_volume", { brand: "singha", region: "bkk" }, [10, 20], 5),
  series("net_sales_volume", { brand: "leo", region: "bkk" }, [30, 40], 10),
  series("net_sales_volume", { brand: "leo", region: "north" }, [5, 5], 20),
  series("days_of_cover", { dc: "dc_1", sku: "a" }, [7, 6], 24),
  series("days_of_cover", { dc: "dc_1", sku: "b" }, [9, 8], 24),
];

describe("forecastSlice", () => {
  test("sums every series of an additive metric when nothing is pinned", () => {
    const slice = forecastSlice(FORECASTS, "net_sales_volume", {});
    if (!slice?.ok) throw new Error("expected a slice");
    expect(slice.seriesCount).toBe(3);
    expect(slice.points.map((point) => point.value)).toEqual([45, 65]);
    expect(slice.points[0].lo).toBe(42);
  });

  test("sums only the series under the pinned dims and weights MAPE by volume", () => {
    const slice = forecastSlice(FORECASTS, "net_sales_volume", { region: "bkk" });
    if (!slice?.ok) throw new Error("expected a slice");
    expect(slice.points.map((point) => point.value)).toEqual([40, 60]);
    expect(slice.mape).toBe(8.5);
  });

  test("returns the single series when every dim is pinned", () => {
    const slice = forecastSlice(FORECASTS, "net_sales_volume", { region: "north", brand: "leo" });
    expect(slice).toEqual({ ok: true, points: FORECASTS[2].points, mape: 20, seriesCount: 1 });
  });

  test("never sums a non-additive metric and names the dims still to pin", () => {
    expect(forecastSlice(FORECASTS, "days_of_cover", { dc: "dc_1" })).toEqual({ ok: false, missingDims: ["sku"] });
  });

  test("returns null when no series matches", () => {
    expect(forecastSlice(FORECASTS, "net_sales_volume", { region: "south" })).toBeNull();
  });
});
