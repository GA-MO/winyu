import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { METRIC_IDS, type MetricId, type MetricResult } from "@/lib/contracts";
import { DATA_AS_OF, monthStart } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { ownAgentsFilter } from "@/lib/data/entities/agents";
import { TH } from "@/lib/i18n/th";
import { METRICS, TARGET_METRICS } from "@/lib/semantic/metrics";
import { winyuTools } from "@/lib/server/agent/tools";
import { presentCard } from "@/lib/cards/present";

function dimsNamedFor(description: string, metric: MetricId): string[] | null {
  const table = description.match(/\(any other is refused\): ([^.]+)\./)?.[1] ?? "";
  const group = table.split("; ").map((part) => part.split(": ")).find(([metrics]) => metrics.split(", ").includes(metric));
  return group ? group[1].split(", ") : null;
}

describe("query_metric for a running month against target", () => {
  test("carries attainment against the whole month's target and what is left to reach it, in the result and the summary", async () => {
    const user = findUser("u_krit");
    if (!user) throw new Error("no sales rep");
    const query = { metric: "net_sales_volume", dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };
    const tool = winyuTools().query_metric;
    const result = (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
    const projection = result.headline.projection;
    expect(projection?.attainmentToDate).toMatch(/^\d+\.\d%$/);
    expect(projection?.remaining).toMatch(/^(เหลืออีก .+ ถึงเป้าทั้งเดือน|ถึงเป้าทั้งเดือนแล้ว)$/);
    expect(result.summary).toContain(projection?.remaining ?? "-");
    expect(result.summary).toContain(projection?.attainmentToDate ?? "-");
  });

  async function askMonthToDate(userId: string, dims: string[]) {
    const user = findUser(userId);
    if (!user) throw new Error(`no ${userId}`);
    const query = { metric: "net_sales_volume", dims, filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };
    const tool = winyuTools().query_metric;
    return (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
  }

  test("split by month it keeps the whole month's base: the share done so far, what is left, and the pro-rated figure named เทียบเป้าตามเวลา (AI-53)", async () => {
    const result = await askMonthToDate("u_krit", ["month"]);
    const projection = result.headline.projection;
    if (!projection) throw new Error("no month-end projection for a month-to-date question split by month");
    expect(result.headline.compareLabel).toBe(TH.dash.pacedTarget);
    expect(result.summary).toContain(`${TH.dash.pacedTarget} `);
    expect(result.summary).toContain(TH.dash.monthSoFar(projection));
    const forecast = result.summary.split(" · ").find((part) => part.includes(projection.attainment));
    expect(forecast).toContain(TH.read.ofMonthTarget);
    if (projection.shortBy) expect(forecast).not.toContain(projection.shortBy);
  });

  test("its card says the same as its summary: the hero is the share of the whole month's target, then what is left and the pace figure by name (AI-53)", async () => {
    const result = await askMonthToDate("u_krit", ["month"]);
    const projection = result.headline.projection;
    if (!projection) throw new Error("no projection");
    const card = presentCard({ title: "t", query: result.query, result });
    expect(card.hero?.value).toBe(projection.attainmentToDate);
    expect(card.hero?.unit).toBe(TH.read.ofMonthTarget);
    const tiles = new Map(card.tiles.map((tile) => [tile.label, tile.value]));
    expect(tiles.get(TH.read.pacedTarget)).toBe(`${Math.round((100 + (result.headline.deltaPercent ?? 0)) * 10) / 10}%`);
    if (projection.shortBy) expect(tiles.get(TH.read.toTarget)).toBe(projection.shortBy);
    expect(tiles.get(TH.read.monthEnd)).toBe(projection.attainment);
  });

  test("a breakdown in the running month calls its percentages ของเป้าตามเวลา and puts the whole month beside the overall row (AI-53)", async () => {
    const result = await askMonthToDate("u_thana", ["region"]);
    const projection = result.headline.projection;
    if (!projection) throw new Error("no projection");
    const card = presentCard({ title: "t", query: result.query, result });
    expect(card.hero?.unit).toBe(TH.read.ofPacedTarget);
    expect(card.hero?.detail).toBe(TH.read.wholeMonth(projection.attainmentToDate, projection.shortBy));
  });

  test("what is left reads as the printed month target less the printed actual, for every scope and unit", async () => {
    const printed = (label: string) => {
      const [, digits, million] = label.match(/([\d,.]+)\s*(ล้าน)?/) ?? [];
      return Number((digits ?? "").replace(/,/g, "")) * (million ? 1_000_000 : 1);
    };
    for (const userId of ["u_thana", "u_anucha", "u_krit"]) {
      const user = findUser(userId);
      if (!user) throw new Error(`no ${userId}`);
      for (const metric of ["net_sales_volume", "net_sales_value"]) {
        const query = { metric, dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };
        const tool = winyuTools().query_metric;
        const result = (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
        const projection = result.headline.projection;
        if (!projection || !projection.remaining.startsWith("เหลืออีก")) continue;
        expect(Math.round(printed(projection.monthTarget) - printed(result.headline.value))).toBe(printed(projection.remaining));
      }
    }
  });
});

describe("a breakdown by the parts that make up the company", () => {
  test("is never cut by a limit: overdue money by region with limit 5 still holds all six regions, ภาคเหนือ included (AI-76)", async () => {
    const user = findUser("u_thana");
    if (!user) throw new Error("no CEO");
    const query = { metric: "ar_overdue", dims: ["region"], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "prev_period", sort: "value_desc", limit: 5 };
    const tool = winyuTools().query_metric;
    const result = (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
    expect(result.rows).toHaveLength(6);
    expect(result.rows.map((row) => row.region)).toContain("ภาคเหนือ");
    expect(result.query.limit).toBeNull();
  });
});

describe("a rep asking about their own book", () => {
  const MONTH = { metric: "net_sales_volume", dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };

  async function ask(userId: string, question: string, query: Record<string, unknown> = MONTH) {
    const user = findUser(userId);
    if (!user) throw new Error(`no ${userId}`);
    const tool = winyuTools().query_metric;
    const turn = { turnId: null, threadId: null, preloadPacketId: null, question, queries: [] };
    return (await runWithAccess(accessFor(user), () => runWithTurn(turn, () => tool.execute(tool.inputSchema().parse(query))))) as Extract<MetricResult, { ok: true }>;
  }

  test("'ผมขายได้กี่เปอร์เซ็นต์' reads the agents assigned to the rep, says so, and keeps the target comparison", async () => {
    const own = ownAgentsFilter("u_krit").agent ?? [];
    expect(own.length).toBeGreaterThan(0);
    const result = await ask("u_krit", "ผมขายได้กี่เปอร์เซ็นต์");
    expect(result.query.filters.agent).toEqual(own);
    expect(result.summary).toContain(TH.quick.ownAgentsApplied(own.length));
    expect(result.headline.projection?.monthTarget).toBeDefined();
  });

  test("a question naming a wider place, another role, or a named agent is left as asked", async () => {
    expect((await ask("u_krit", "ยอดทั้งภาคเดือนนี้ผมอยากรู้")).query.filters.agent).toBeUndefined();
    expect((await ask("u_anucha", "ผมขายได้กี่เปอร์เซ็นต์")).query.filters.agent).toBeUndefined();
    expect((await ask("u_krit", "ยอดขายเดือนนี้เท่าไร")).query.filters.agent).toBeUndefined();
    const named = await ask("u_krit", "ของผมที่อีสานรุ่งโรจน์", { ...MONTH, filters: { agent: ["อีสานรุ่งโรจน์"] } });
    expect(named.query.filters.agent?.length).toBe(1);
  });
});

describe("query_metric tells the model what each metric accepts", () => {
  const description = winyuTools().query_metric.description();

  test("every metric's dims are named, exactly the ones the engine accepts", () => {
    for (const metric of METRIC_IDS) expect(dimsNamedFor(description, metric)).toEqual([...METRICS[metric].dims]);
    expect(dimsNamedFor(description, "days_of_cover")).not.toContain("agent");
  });

  test("compare target is offered only for metrics that have a target", () => {
    const targets = description.match(/compare "target" only for ([a-z_, ]+)\./)?.[1].split(", ");
    expect(targets?.sort()).toEqual([...TARGET_METRICS].sort());
    expect(targets).not.toContain("gross_margin");
  });
});
