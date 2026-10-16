import { describe, expect, test } from "bun:test";
import { METRIC_IDS, type MetricId } from "@/lib/contracts";
import { METRICS, TARGET_METRICS } from "@/lib/semantic/metrics";
import { winyuTools } from "@/lib/server/agent/tools";

function dimsNamedFor(description: string, metric: MetricId): string[] | null {
  const table = description.match(/\(any other is refused\): ([^.]+)\./)?.[1] ?? "";
  const group = table.split("; ").map((part) => part.split(": ")).find(([metrics]) => metrics.split(", ").includes(metric));
  return group ? group[1].split(", ") : null;
}

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
