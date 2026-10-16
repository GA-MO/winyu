import { describe, expect, test } from "bun:test";
import type { MetricQuery, NextAction } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { openAlertsFor } from "@/lib/server/alerts";
import { loadDictionary } from "./master-data";
import { runMetric } from "./metrics";
import { actionsForMetric } from "./next-actions";

const CEO = accessFor(findUser("u_thana")!);
const REGIONAL_ROLE = "sales_rsm";

function wholeCountry(metric: MetricQuery["metric"]): MetricQuery {
  return { metric, dims: ["month"], filters: {}, range: { from: "2026-10-01", to: "2026-10-31" }, grain: "month", compare: "target", limit: 10 };
}

function sendTarget(actions: readonly NextAction[]): string[] {
  const send = actions.find((action) => action.kind === "send");
  const to = (send?.input as { to?: unknown } | undefined)?.to;
  return Array.isArray(to) ? to.filter((id): id is string => typeof id === "string") : [];
}

describe("the send button of a company-wide card (AI-115)", () => {
  test("never preselects a regional manager because an open alert sits in one region", async () => {
    const metrics = [...new Set(openAlertsFor(CEO).map((alert) => alert.metric))];
    expect(metrics.length).toBeGreaterThan(0);
    const dictionary = await loadDictionary();
    for (const metric of metrics) {
      const result = await runMetric(wholeCountry(metric), CEO);
      const regional = sendTarget(actionsForMetric(CEO, result, dictionary)).filter((id) => findUser(id)?.role === REGIONAL_ROLE);
      expect({ metric, regional }).toEqual({ metric, regional: [] });
    }
  });
});

describe("a card compared with an earlier period drills into the row that changed for the worse (AI-186)", () => {
  const query: MetricQuery = { metric: "ar_overdue", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "prev_period", limit: 10, sort: "value_desc" };

  test("overdue AR by agent, ranked by amount, asks why about the sharpest rise, not the largest balance", async () => {
    const result = await runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const [worst] = result.rows.filter((row) => typeof row.delta_pct === "number" && row.delta_pct >= 5).sort((left, right) => Number(right.delta_pct) - Number(left.delta_pct));
    if (!worst) throw new Error("no agent's overdue AR rose");
    expect(String(result.rows[0].agent)).not.toBe(String(worst.agent));
    const why = actionsForMetric(CEO, result, await loadDictionary()).find((action) => action.id === "drill-why");
    expect(why?.label).toContain(String(worst.agent));
  });

  test("when no row changed for the worse, no drill asks why a row that improved got worse", async () => {
    const result = await runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const improved = { ...result, rows: result.rows.map((row) => ({ ...row, delta_pct: -Math.abs(Number(row.delta_pct ?? 1)) })) };
    const why = actionsForMetric(CEO, improved, await loadDictionary()).find((action) => action.id === "drill-why");
    expect(why?.label ?? "").not.toContain(String(result.rows[0].agent));
  });
});
