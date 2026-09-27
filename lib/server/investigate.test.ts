import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { callsWithAnomalies, openAnomalies } from "./investigate";

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return accessFor(user);
}

describe("an investigation starts from anomalies", () => {
  test("the CEO's open anomalies are read through get_alerts before any story is written", async () => {
    const call = await openAnomalies(accessOf("u_thana"));
    const output = call.output as { ok: boolean; rows: { severity: string; metric: string; scopeLabel: string }[] };
    expect(call.tool).toBe("get_alerts");
    expect(call.input).toEqual({ status: "open", limit: 10 });
    expect(output.ok).toBe(true);
    expect(output.rows.length).toBeGreaterThan(0);
    expect(output.rows.length).toBeLessThanOrEqual(10);
    expect(output.rows.some((row) => row.severity === "P1" && row.scopeLabel.length > 0)).toBe(true);
  });

  test("a drill that never called get_alerts still keeps the anomaly read on the call list", () => {
    const anomalies = { tool: "get_alerts", input: { status: "open", limit: 10 }, output: { rows: [{ metric: "days_of_cover" }] } };
    const drilled = [{ tool: "explain_gap", input: {}, output: {} }];
    expect(callsWithAnomalies(anomalies, drilled).map((call) => call.tool)).toEqual(["get_alerts", "explain_gap"]);
    expect(callsWithAnomalies(anomalies, [anomalies, ...drilled])).toHaveLength(2);
  });
});
