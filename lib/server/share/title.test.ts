import { describe, expect, test } from "bun:test";
import type { SharedCard } from "@/lib/share/card";
import { matterSubject, matterTitle } from "./title";

const RSM_TEAM_CARD: SharedCard = {
  kind: "tool",
  reads: [
    { tool: "query_metric", input: { compare: "target", grain: "month", metric: "net_sales_value", filters: {}, period: "this_month", dims: ["region"] } },
    { tool: "query_metric", input: { limit: 10, dims: ["agent"], compare: "target", sort: "delta_asc", metric: "net_sales_value", filters: {}, period: "this_month", grain: "month" } },
  ],
};

describe("a matter's title follows the read its focus is on (AI-273)", () => {
  test("the RSM's paired card sent about ขอนแก่นมหาชัย is titled by the agent ranking, never the region rollup", async () => {
    expect(await matterTitle(RSM_TEAM_CARD, ["ขอนแก่นมหาชัย"])).toBe("มูลค่าขายเข้า · รายเอเย่นต์ · ขอนแก่นมหาชัย");
  });

  test("with nothing singled out the card's first read names it", async () => {
    expect(await matterTitle(RSM_TEAM_CARD)).toBe("มูลค่าขายเข้า · รายภาค");
  });
});

describe("a sent why card names its scope (AI-267)", () => {
  test("the RSM's month-close gap card by province in ภาคอีสาน", async () => {
    const card: SharedCard = { kind: "tool", reads: [{ tool: "explain_gap", input: { filters: { region: "northeast" }, range: { to: "2026-11-27", from: "2026-11-01" }, split: "province", metric: "net_sales_value", compare: "target" } }] };
    expect(await matterTitle(card)).toBe("มูลค่าขายเข้า · รายจังหวัด · ภาคอีสาน");
    expect(await matterSubject(card)).toBe("ภาคอีสาน");
  });
});
