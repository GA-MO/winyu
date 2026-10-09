import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { explain } from "./hypothesis";

const NORTH_WINDOW = { from: "2026-09-19", to: "2026-09-22" };

describe("what a movement is put down to", async () => {
  test("bottled water rising with the haze in Chiang Mai and Lamphun is put down to PM2.5, despite the weekly cycle", async () => {
    for (const province of ["pv_chiangmai", "pv_lamphun"]) {
      const found = await explain({ metric: "sell_out_volume", dims: { sku: "sku_purra_pet600", province, region: "north" }, direction: "up", window: NORTH_WINDOW, observed: 1, expected: 1, region: "north", detail: null });
      expect(found.hypothesis).toBe(TH.engine.hypothesis.pm25(province === "pv_chiangmai" ? "เชียงใหม่" : "ลำพูน"));
    }
  });

  test("a promotion explains a rise in what it sells, never a fall or a plant's output", async () => {
    const window = { from: "2026-09-10", to: "2026-09-22" };
    const soda = { sku: "sku_singha_soda_can320", channel: "modern_trade", region: "bkk" };
    const rise = await explain({ metric: "sell_out_volume", dims: soda, direction: "up", window, observed: 130, expected: 100, region: "bkk", detail: null });
    expect(rise.explained).toBe(true);
    const fall = await explain({ metric: "sell_out_volume", dims: soda, direction: "down", window, observed: 90, expected: 100, region: "bkk", detail: null });
    expect(fall.explained).toBe(false);
    const plant = await explain({ metric: "production_output", dims: { plant: "pl_singburi", region: "central" }, direction: "up", window, observed: 109, expected: 100, region: "central", detail: null });
    expect(plant.explained).toBe(false);
  });
});
