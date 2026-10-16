import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { METRIC_IDS, type MetricId, type MetricResult } from "@/lib/contracts";
import { TODAY } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { runWithAccess } from "@/lib/server/request-context";
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
    const query = { metric: "net_sales_volume", dims: [], filters: {}, range: { from: `${TODAY.slice(0, 8)}01`, to: TODAY }, grain: "month", compare: "target", limit: null };
    const tool = winyuTools().query_metric;
    const result = (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(query)))) as Extract<MetricResult, { ok: true }>;
    const projection = result.headline.projection;
    expect(projection?.attainmentToDate).toMatch(/^\d+\.\d%$/);
    expect(projection?.remaining).toMatch(/^(เหลืออีก .+ ถึงเป้า|ถึงเป้าแล้ว)$/);
    expect(result.summary).toContain(projection?.remaining ?? "-");
    expect(result.summary).toContain(projection?.attainmentToDate ?? "-");
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
