import { afterEach, describe, expect, test } from "bun:test";
import type { MasterData, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { GENERATOR_MASTER } from "@/lib/data/master";
import { findUser } from "@/lib/data/entities/users";
import { ports, registerPorts, resetPorts } from "@/lib/server/ports";
import { loadDictionary } from "./master-data";
import { runMetric } from "./metrics";

const REP = accessFor(findUser("u_krit")!);
const CEO = accessFor(findUser("u_thana")!);
const RENAMED = "ขอนแก่น (ชื่อจากคลังข้อมูล)";

function question(partial: Partial<MetricQuery> & Pick<MetricQuery, "metric">): MetricQuery {
  return { dims: [], filters: {}, range: { from: "2026-08-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null, ...partial };
}

function warehouseWith(master: MasterData): { loads: () => number } {
  let loads = 0;
  registerPorts({
    metrics: {
      ...ports().metrics,
      masterData: async () => {
        loads += 1;
        return master;
      },
    },
  });
  return { loads: () => loads };
}

const REP_AGENT = GENERATOR_MASTER.agents.find((agent) => agent.region === "northeast")!;

afterEach(() => resetPorts());

describe("master data behind the metrics port", () => {
  test("row labels come from the warehouse's dimension tables", async () => {
    warehouseWith({ ...GENERATOR_MASTER, provinces: GENERATOR_MASTER.provinces.map((province) => (province.id === "pv_khonkaen" ? { ...province, nameTh: RENAMED } : province)) });
    const result = await runMetric(question({ metric: "net_sales_volume", dims: ["province"] }), CEO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.some((row) => row.province === RENAMED)).toBe(true);
  });

  test("the region an agent belongs to is the warehouse's, so scope follows it", async () => {
    expect((await runMetric(question({ metric: "net_sales_volume", filters: { agent: [REP_AGENT.id] } }), REP)).ok).toBe(true);
    warehouseWith({ ...GENERATOR_MASTER, agents: GENERATOR_MASTER.agents.map((agent) => (agent.id === REP_AGENT.id ? { ...agent, region: "bkk" } : agent)) });
    const moved = await runMetric(question({ metric: "net_sales_volume", filters: { agent: [REP_AGENT.id] } }), REP);
    expect(moved.ok ? null : moved.code).toBe("PERMISSION_DENIED");
  });

  test("one load serves many questions until the port changes", async () => {
    const first = warehouseWith(GENERATOR_MASTER);
    await Promise.all([loadDictionary(), loadDictionary(), runMetric(question({ metric: "net_sales_volume" }), CEO)]);
    expect(first.loads()).toBe(1);
    const second = warehouseWith(GENERATOR_MASTER);
    await loadDictionary();
    expect(second.loads()).toBe(1);
  });

  test("a failed load is not kept", async () => {
    let calls = 0;
    registerPorts({
      metrics: {
        ...ports().metrics,
        masterData: async () => {
          calls += 1;
          if (calls === 1) throw new Error("warehouse down");
          return GENERATOR_MASTER;
        },
      },
    });
    await expect(loadDictionary()).rejects.toThrow("warehouse down");
    await expect(loadDictionary()).resolves.toBeDefined();
  });

  test("a refresh that fails after the ten minutes serves the last dictionary and tries again half a minute later", async () => {
    let calls = 0;
    registerPorts({
      metrics: {
        ...ports().metrics,
        masterData: async () => {
          calls += 1;
          if (calls === 2) throw new Error("warehouse down");
          return GENERATOR_MASTER;
        },
      },
    });
    const start = Date.now();
    const loaded = await loadDictionary(start);
    const outage = start + 11 * 60_000;
    expect(await loadDictionary(outage)).toBe(loaded);
    expect(await loadDictionary(outage + 1_000)).toBe(loaded);
    expect(calls).toBe(2);
    await loadDictionary(outage + 31_000);
    expect(calls).toBe(3);
  });
});
