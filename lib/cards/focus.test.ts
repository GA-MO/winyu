import { describe, expect, test } from "bun:test";
import { REGIONS, type Alert, type MetricQuery, type MetricResult } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { loadDictionary } from "@/lib/server/master-data";
import { alertForAnswer, cardFocus } from "./focus";
import { weakestRow } from "./present";

const CEO = accessFor(findUser("u_thana")!);
const QUERY: MetricQuery = { metric: "ar_overdue", dims: ["region"], filters: {}, range: { from: "2026-08-01", to: "2026-08-31" }, grain: "month", compare: "none", limit: null, sort: "value_desc" };

function alertOn(id: string, region: string): Alert {
  return {
    id,
    at: "2026-08-31T00:00:00Z",
    severity: "P2",
    metric: "ar_overdue",
    dims: { region },
    window: { from: "2026-08-01", to: "2026-08-31" },
    observed: 2,
    expected: 1,
    zScore: 3,
    direction: "up",
    hypothesis: "h",
    verifySteps: [
      { text: "a", metrics: [] },
      { text: "b", metrics: [] },
    ],
    ownerUserId: "u_thana",
    status: "open",
    dismissCount: 0,
  };
}

describe("the alert a metric card follows (AI-77)", () => {
  test("is the one on the row the answer points at, never an alert on another row that happens to sit in the slice", async () => {
    const dictionary = await loadDictionary();
    const result = runMetric(QUERY, CEO) as Extract<MetricResult, { ok: true }>;
    const worst = weakestRow(result.query, result)?.label;
    if (!worst) throw new Error("no weakest row");
    const regionId = (label: string) => REGIONS.find((id) => dictionary.displayLabel("region", id) === label) ?? label;
    const other = result.rows.map((row) => String(row.region)).find((label) => label !== worst) ?? "";
    const onAnswer = alertOn("on-answer", regionId(worst));
    const elsewhere = alertOn("elsewhere", regionId(other));
    expect(alertForAnswer(result, [elsewhere, onAnswer], dictionary)?.id).toBe("on-answer");
    expect(alertForAnswer(result, [elsewhere], dictionary)).toBeNull();
    expect(cardFocus(result, alertForAnswer(result, [elsewhere], dictionary), dictionary).row).toBe(worst);
  });
});
