import { afterEach, describe, expect, test } from "bun:test";
import type { FactRequest, FactResult, MasterData, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { SUPPRESSED_VALUE } from "@/lib/access/suppression";
import { findUser } from "@/lib/data/entities/users";
import { runMetric as runOnGenerator } from "@/lib/data/query";
import { ports, registerPorts, resetPorts } from "@/lib/server/ports";
import { runMetric } from "./metrics";
import { loadDictionary } from "./master-data";
import { actionsForMetric } from "./next-actions";
import { DATA_AS_OF, dataDay, formatThaiDate, monthStart } from "@/lib/data/dates";

const REP = accessFor(findUser("u_krit")!);
const CFO = accessFor(findUser("u_siriporn")!);
const HR = accessFor(findUser("u_may")!);
const RANGE = { from: monthStart(DATA_AS_OF, 1), to: DATA_AS_OF };
const REQUEST_KEYS = ["dims", "filters", "labelShift", "measure", "metric", "range"];

function question(partial: Partial<MetricQuery> & Pick<MetricQuery, "metric">): MetricQuery {
  return { dims: [], filters: {}, range: RANGE, grain: "month", compare: "none", limit: null, ...partial };
}

function recordingWarehouse(answer: (request: FactRequest) => FactResult, master?: MasterData): FactRequest[] {
  const seen: FactRequest[] = [];
  const base = ports().metrics;
  registerPorts({
    metrics: {
      ...base,
      masterData: master ? async () => master : base.masterData,
      readFacts: async (requests) => {
        seen.push(...requests);
        return requests.map(answer);
      },
    },
  });
  return seen;
}

afterEach(() => resetPorts());

describe("runMetric over the metrics port", () => {
  test("the warehouse receives only requests already narrowed to the caller's scope", async () => {
    const seen = recordingWarehouse(() => ({ ok: true, rows: [] }));
    await runMetric(question({ metric: "net_sales_volume", dims: ["region"], compare: "prev_period" }), REP);
    expect(seen).toHaveLength(2);
    for (const request of seen) {
      expect(Object.keys(request).sort()).toEqual(REQUEST_KEYS);
      expect(request.filters.region).toEqual(REP.regions as string[]);
    }
  });

  test("a denied question never reaches the warehouse", async () => {
    const seen = recordingWarehouse(() => ({ ok: true, rows: [] }));
    const outOfRegion = await runMetric(question({ metric: "net_sales_volume", filters: { region: ["bangkok"] } }), REP);
    const hiddenMetric = await runMetric(question({ metric: "headcount" }), REP);
    expect(outOfRegion.ok ? null : outOfRegion.code).toBe("PERMISSION_DENIED");
    expect(hiddenMetric.ok ? null : hiddenMetric.code).toBe("PERMISSION_DENIED");
    expect(seen).toHaveLength(0);
  });

  test("a masked metric stays masked whatever numbers the warehouse sends", async () => {
    recordingWarehouse(() => ({ ok: true, rows: [{ dims: { department: "dept_sales" }, value: 48_000, weight: 120 }] }));
    const result = await runMetric(question({ metric: "avg_salary", dims: ["department"] }), CFO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.every((row) => row.value === SUPPRESSED_VALUE)).toBe(true);
    expect(result.headline.value).toBe("—");
  });

  test("a department too small to stay anonymous is hidden by the small-cell rule, said apart from role masking, with no access request", async () => {
    const master = await ports().metrics.masterData();
    recordingWarehouse(
      () => ({
        ok: true,
        rows: [
          { dims: { department: "dept_tiny" }, value: 2, weight: 1 },
          { dims: { department: "dept_sales" }, value: 1_240, weight: 1 },
        ],
      }),
      { ...master, departments: [...master.departments, { id: "dept_tiny", nameTh: "ฝ่ายเล็ก", label: "Tiny", headcount: 2 }] },
    );
    const result = await runMetric(question({ metric: "headcount", dims: ["department"] }), HR);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.find((row) => row.department === "ฝ่ายเล็ก")?.value).toBe(SUPPRESSED_VALUE);
    expect(result.rows.find((row) => row.department === "ขาย")?.value).toBe(1_240);
    expect(result.provenance.suppressedRows).toBe(1);
    expect(result.provenance.masked).toEqual([]);
    const actions = actionsForMetric(HR, result, await loadDictionary());
    expect(actions.some((action) => action.kind === "request_access")).toBe(false);
  });

  test("overdue AR from any warehouse is never suppressed, even for a province with one agent", async () => {
    recordingWarehouse(() => ({
      ok: true,
      rows: [
        { dims: { province: "pv_phuket" }, value: 1_000_000, weight: 1 },
        { dims: { province: "pv_bangkok" }, value: 9_000_000, weight: 1 },
      ],
    }));
    const result = await runMetric(question({ metric: "ar_overdue", dims: ["province"] }), CFO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.find((row) => row.province === "ภูเก็ต")?.value).toBe(1_000_000);
    expect(result.provenance.suppressedRows).toBeUndefined();
  });

  test("a role-masked metric still offers the access request", async () => {
    recordingWarehouse(() => ({ ok: true, rows: [{ dims: { department: "dept_sales" }, value: 48_000, weight: 120 }] }));
    const result = await runMetric(question({ metric: "avg_salary", dims: ["department"] }), CFO);
    if (!result.ok) throw new Error(result.error);
    const actions = actionsForMetric(CFO, result, await loadDictionary());
    expect(actions.some((action) => action.kind === "request_access")).toBe(true);
  });

  test("a warehouse failure is the answer's failure", async () => {
    recordingWarehouse(() => ({ ok: false, code: "BAD_QUERY", error: "warehouse busy" }));
    const result = await runMetric(question({ metric: "net_sales_volume" }), CFO);
    expect(result).toEqual({ ok: false, code: "BAD_QUERY", error: "warehouse busy" });
  });

  test("the generator port answers exactly as the in-process engine", async () => {
    const asked = question({ metric: "net_sales_volume", dims: ["province"], compare: "prev_year", sort: "delta_asc", limit: 5 });
    expect(await runMetric(asked, REP)).toEqual(runOnGenerator(asked, REP));
  });
});

describe("where the month ends", () => {
  const DIRECTOR = accessFor(findUser("u_prasit")!);
  const MONTH_TO_DATE = { from: monthStart(DATA_AS_OF), to: DATA_AS_OF };
  const northeastByAgent = question({ metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: MONTH_TO_DATE, compare: "target" });

  test("a month-to-date total against target carries the month-end projection, and the model reads it in the summary", async () => {
    const result = await runMetric(northeastByAgent, DIRECTOR);
    if (!result.ok) throw new Error(result.error);
    const projection = result.headline.projection;
    expect(projection?.recentDays).toBe(7);
    expect(projection?.attainment).toMatch(/^\d+\.\d%$/);
    expect(result.summary).toContain(`≈ ${projection?.attainment} ของเป้า`);
  });

  test("a role that sees the metric masked learns nothing about the month end", async () => {
    const result = await runMetric(question({ metric: "net_sales_volume", range: MONTH_TO_DATE, compare: "target" }), accessFor(findUser("u_ton")!));
    expect(result.ok && result.headline.projection).toBeFalsy();
    expect(result.ok ? result.summary : "").not.toContain("สิ้นเดือน");
  });

  test("a one-day window is labelled with one date, not a range from a day to itself", async () => {
    const result = await runMetric(question({ metric: "days_of_cover", range: { from: DATA_AS_OF, to: DATA_AS_OF }, grain: "day" }), DIRECTOR);
    expect(result.ok && result.headline.periodLabel).toBe(formatThaiDate(DATA_AS_OF));
  });

  test("another window, another comparison or a split over time says nothing about the month end", async () => {
    const answers = await Promise.all([
      runMetric({ ...northeastByAgent, range: { from: monthStart(DATA_AS_OF), to: dataDay(-7) } }, DIRECTOR),
      runMetric({ ...northeastByAgent, compare: "prev_year" }, DIRECTOR),
      runMetric({ ...northeastByAgent, dims: ["week"], grain: "week" }, DIRECTOR),
    ]);
    for (const result of answers) expect(result.ok && result.headline.projection).toBeFalsy();
  });
});
