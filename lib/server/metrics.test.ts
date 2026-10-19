import { afterEach, describe, expect, test } from "bun:test";
import type { FactRequest, FactResult, MasterData, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { SUPPRESSED_VALUE } from "@/lib/access/suppression";
import { findUser } from "@/lib/data/entities/users";
import { runMetric as runOnGenerator } from "@/lib/data/query";
import { ports, registerPorts, resetPorts } from "@/lib/server/ports";
import { runMetric } from "./metrics";
import { loadDictionary } from "./master-data";
import { actionsForMetric, followUpsForMetric } from "./next-actions";
import { DATA_AS_OF, dataDay, formatThaiDate, monthStart } from "@/lib/data/dates";

const REP = accessFor(findUser("u_krit")!);
const CFO = accessFor(findUser("u_siriporn")!);
const CEO = accessFor(findUser("u_thana")!);
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
          { dims: { department: "dept_tiny" }, value: 1, weight: 2 },
          { dims: { department: "dept_sales" }, value: 15, weight: 1_240 },
        ],
      }),
      { ...master, departments: [...master.departments, { id: "dept_tiny", nameTh: "ฝ่ายเล็ก", label: "Tiny", headcount: 2 }] },
    );
    const result = await runMetric(question({ metric: "attrition_rate", dims: ["department"] }), CEO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.find((row) => row.department === "ฝ่ายเล็ก")?.value).toBe(SUPPRESSED_VALUE);
    expect(result.rows.find((row) => row.department === "ขาย")?.value).toBeTypeOf("number");
    expect(result.provenance.suppressedRows).toBe(1);
    expect(result.provenance.masked).toEqual([]);
    const actions = actionsForMetric(CEO, result, await loadDictionary());
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

  test("a hidden number reads plainly: no jargon, no data-coverage line, and no follow-up chips into the hidden data (AI-125)", async () => {
    const result = await runMetric(question({ metric: "ar_overdue", dims: ["agent"], filters: { agent: ["ag_nea_02"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF } }), REP);
    if (!result.ok) throw new Error(result.error);
    expect(result.provenance.masked.length).toBeGreaterThan(0);
    expect(result.summary).not.toContain("masked");
    expect(result.summary).not.toContain("โครงสร้างข้อมูล");
    expect(result.summary).not.toContain("มีข้อมูล");
    const dictionary = await loadDictionary();
    expect(followUpsForMetric(REP, result, dictionary, actionsForMetric(REP, result, dictionary))).toEqual([]);
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

describe("the summary names the end the question sorted by (AI-348)", () => {
  const southByProvince = (sort: MetricQuery["sort"]) => runOnGenerator(question({ metric: "net_sales_value", dims: ["province"], filters: { region: ["south"] }, compare: "prev_period", sort }), CEO);
  const valuesOf = (result: ReturnType<typeof southByProvince>) => (result.ok ? result.rows.map((row) => Number(row.value)) : []);
  const labelsOf = (result: ReturnType<typeof southByProvince>) => (result.ok ? result.rows.map((row) => String(row.province)) : []);

  test("sorted lowest first, the rows rise and the summary leads with the lowest, worded ต่ำสุด", () => {
    const result = southByProvince("value_asc");
    if (!result.ok) throw new Error(result.error);
    const values = valuesOf(result);
    expect(values).toEqual([...values].sort((left, right) => left - right));
    expect(result.summary).toContain(`ต่ำสุด: ${labelsOf(result)[0]} `);
    expect(result.summary).not.toContain("สูงสุด:");
  });

  test("sorted highest first, the summary still leads with the highest, worded สูงสุด", () => {
    const result = southByProvince("value_desc");
    if (!result.ok) throw new Error(result.error);
    const values = valuesOf(result);
    expect(values).toEqual([...values].sort((left, right) => right - left));
    expect(result.summary).toContain(`สูงสุด: ${labelsOf(result)[0]} `);
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

  test("what is left to the month's target is the unrounded target less the unrounded actual, printed once at the precision of the target (AI-102)", async () => {
    const mine = question({ metric: "net_sales_volume", dims: ["agent"], range: MONTH_TO_DATE, compare: "target" });
    const result = await runMetric(mine, REP);
    const total = runOnGenerator({ ...mine, dims: [] }, REP);
    if (!result.ok || !total.ok) throw new Error("no answer");
    const elapsed = Number(DATA_AS_OF.slice(8));
    const monthDays = new Date(Date.UTC(Number(DATA_AS_OF.slice(0, 4)), Number(DATA_AS_OF.slice(5, 7)), 0)).getUTCDate();
    const [actual, targetSoFar] = [Number(total.rows[0].value), Number(total.rows[0].compare_value)];
    const left = (targetSoFar / elapsed) * monthDays - actual;
    const shortBy = result.headline.projection?.shortBy ?? "";
    expect(shortBy).toBe(`${(left / 1_000_000).toFixed(2)} ล้านลิตร`);
    expect(result.summary).toContain(shortBy);
  });

  test("the month end carries its own shortfall, smaller than the shortfall to date when the month keeps selling (AI-204)", async () => {
    const result = await runMetric(northeastByAgent, DIRECTOR);
    if (!result.ok) throw new Error(result.error);
    const projection = result.headline.projection;
    const amount = (text: string | null | undefined) => Number((text ?? "").split(" ")[0].replace(/,/g, ""));
    expect(projection?.endShortBy).toMatch(/ล้านลิตร$/);
    expect(amount(projection?.endShortBy)).toBeGreaterThan(0);
    expect(amount(projection?.endShortBy)).toBeLessThan(amount(projection?.shortBy));
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
