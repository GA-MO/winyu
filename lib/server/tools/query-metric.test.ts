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
    expect(projection?.remaining).toMatch(/^(เหลืออีก .+ ถึงเป้า|ถึงเป้าแล้ว)$/);
    expect(result.summary).toContain(projection?.remaining ?? "-");
    expect(result.summary).toContain(projection?.attainmentToDate ?? "-");
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

describe("a rep asking about their own book", () => {
  const MONTH = { metric: "net_sales_volume", dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };

  async function ask(userId: string, question: string, query: Record<string, unknown> = MONTH) {
    const user = findUser(userId);
    if (!user) throw new Error(`no ${userId}`);
    const tool = winyuTools().query_metric;
    const turn = { turnId: null, threadId: null, question, queries: [] };
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
