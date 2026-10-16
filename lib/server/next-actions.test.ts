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
