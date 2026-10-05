import { describe, expect, test } from "bun:test";
import type { AccessContext, Dim, MetricId, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { INJECTED_ANOMALIES, anomalyById } from "./anomalies";
import { productionTables } from "./cache";
import { DAY_COUNT, toDayIndex } from "./dates";
import { PRODUCTION_LINES } from "./entities/supply";
import { findUser } from "./entities/users";
import { runMetric } from "./query";

function ceo(): AccessContext {
  const user = findUser("u_thana");
  if (!user) throw new Error("missing demo user u_thana");
  return accessFor(user);
}

const ACCESS = ceo();

function total(metric: MetricId, filters: Partial<Record<Dim, string[]>>, from: string, to: string): number {
  const query: MetricQuery = { metric, dims: [], filters, range: { from, to }, grain: "day", compare: "none", limit: null };
  const result = runMetric(query, ACCESS);
  if (!result.ok) throw new Error(`${metric}: ${result.error}`);
  return Number(result.rows[0]?.value ?? 0);
}

function lineOutput(lineId: string, from: string, to: string): number {
  const lineIndex = PRODUCTION_LINES.findIndex((entry) => entry.line.id === lineId);
  const table = productionTables().outputHl;
  let sum = 0;
  for (let day = toDayIndex(from); day <= toDayIndex(to); day += 1) sum += table[lineIndex * DAY_COUNT + day];
  return sum;
}

describe("injected anomalies", () => {
  test("the registry holds exactly the seven documented anomalies", () => {
    expect(INJECTED_ANOMALIES).toHaveLength(7);
    const ids = INJECTED_ANOMALIES.map((anomaly) => anomaly.id);
    expect(new Set(ids).size).toBe(7);
    for (const anomaly of INJECTED_ANOMALIES) {
      expect(anomaly.description.length).toBeGreaterThan(10);
      expect(["up", "down"]).toContain(anomaly.direction);
      expect(anomaly.window.from <= anomaly.window.to).toBe(true);
    }
  });

  test("1 · ส.รุ่งเรือง Leo 620 sell-in collapses while sell-out holds", () => {
    const filters = { agent: ["ag_nea_07"], sku: ["sku_leo_bottle620"] };
    const recentIn = total("net_sales_volume", filters, "2026-09-02", "2026-09-22");
    const priorIn = total("net_sales_volume", filters, "2026-08-12", "2026-09-01");
    const recentOut = total("sell_out_volume", filters, "2026-09-02", "2026-09-22");
    const priorOut = total("sell_out_volume", filters, "2026-08-12", "2026-09-01");
    expect(recentIn / priorIn).toBeLessThanOrEqual(0.7);
    expect(Math.abs(recentOut / priorOut - 1)).toBeLessThanOrEqual(0.1);
  });

  test("2 · Purra PET 600 sell-out jumps in เชียงใหม่ and ลำพูน", () => {
    const filters = { sku: ["sku_purra_pet600"], province: ["pv_chiangmai", "pv_lamphun"] };
    const recent = total("sell_out_volume", filters, "2026-09-18", "2026-09-22");
    const prior = total("sell_out_volume", filters, "2026-09-13", "2026-09-17");
    expect(recent / prior).toBeGreaterThan(1.2);
  });

  test("3 · DC ลำพูน days of cover for Purra 600 falls under the ten day threshold", () => {
    const filters = { dc: ["dc_lamphun"], sku: ["sku_purra_pet600"] };
    const now = total("days_of_cover", filters, "2026-09-22", "2026-09-22");
    const before = total("days_of_cover", filters, "2026-08-15", "2026-08-15");
    expect(now).toBeLessThan(10);
    expect(now).toBeLessThan(before * 0.6);
  });

  test("4 · two silent Northeast agents drag the region down week over week", () => {
    const region = { region: ["northeast"] };
    const recent = total("net_sales_volume", region, "2026-09-16", "2026-09-22");
    const prior = total("net_sales_volume", region, "2026-09-02", "2026-09-08");
    expect(recent / prior).toBeLessThan(0.92);
    const silent = { agent: ["ag_nea_02", "ag_nea_05"], brand: ["leo", "singha"] };
    const silentRecent = total("net_sales_volume", silent, "2026-09-16", "2026-09-22");
    const silentPrior = total("net_sales_volume", silent, "2026-09-02", "2026-09-08");
    expect(silentRecent / silentPrior).toBeLessThan(0.1);
  });

  test("5 · modern trade Singha Soda can 320 lifts during the C-Store promotion", () => {
    const filters = { channel: ["modern_trade"], sku: ["sku_singha_soda_can320"], region: ["bkk", "central"] };
    const promo = total("sell_out_volume", filters, "2026-09-05", "2026-09-22");
    const before = total("sell_out_volume", filters, "2026-08-18", "2026-09-04");
    expect(promo / before).toBeGreaterThan(1.15);
    expect(anomalyById("anom_cstore_soda_promo")?.explainedBy).toBe("cmp_cstore_soda_promo");
  });

  test("6 · AR overdue more than doubles for three tier C agents in the South", () => {
    const filters = { agent: ["ag_sou_02", "ag_sou_05", "ag_sou_06"] };
    const recent = total("ar_overdue", filters, "2026-08-01", "2026-08-31");
    const prior = total("ar_overdue", filters, "2026-07-01", "2026-07-31");
    expect(recent / prior).toBeGreaterThan(1.6);
    const peers = { agent: ["ag_sou_01", "ag_sou_03"] };
    const peerRecent = total("ar_overdue", peers, "2026-08-01", "2026-08-31");
    const peerPrior = total("ar_overdue", peers, "2026-07-01", "2026-07-31");
    expect(peerRecent / peerPrior).toBeLessThan(1.6);
  });

  test("7 · Khon Kaen line 2 loses a fifth of its output during maintenance", () => {
    const during = lineOutput("pl_khonkaen_l2", "2026-09-14", "2026-09-17");
    const before = lineOutput("pl_khonkaen_l2", "2026-09-07", "2026-09-10");
    expect(during / before).toBeLessThan(0.85);
    const plantDuring = total("production_output", { plant: ["pl_khonkaen"] }, "2026-09-14", "2026-09-17");
    const plantBefore = total("production_output", { plant: ["pl_khonkaen"] }, "2026-09-07", "2026-09-10");
    expect(plantDuring / plantBefore).toBeLessThan(0.97);
    const peerLine = lineOutput("pl_khonkaen_l1", "2026-09-14", "2026-09-17") / lineOutput("pl_khonkaen_l1", "2026-09-07", "2026-09-10");
    expect(peerLine).toBeGreaterThan(0.9);
  });
});
