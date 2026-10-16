import { describe, expect, test } from "bun:test";
import { sharedComposedCard, sharedToolCard, shareTitle, type ExchangeRead } from "./card";

const CALLS: ExchangeRead[] = [
  { toolCallId: "a", tool: "query_metric", args: { metric: "net_sales_value", dims: ["region"] }, returned: true },
  { toolCallId: "c", tool: "get_person", args: { id: "u_anucha", name: "" }, returned: true },
  { toolCallId: "e", tool: "find_people", args: { manager: "u_anucha" }, returned: false },
];

describe("the share behind a card is its reads", () => {
  test("a fixed card shares its own call", () => {
    expect(sharedToolCard(CALLS, "a")).toEqual({ kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value", dims: ["region"] } }] });
    expect(sharedToolCard(CALLS, "missing")).toBeNull();
  });

  test("a composed card shares the composable reads that returned, in call order, with its components", () => {
    const surface = { surfaceId: "s", components: [{ id: "root", component: "Card" as const, title: "ทีม 5 คน", children: ["x"] }, { id: "x", component: "Person" as const, name: { path: "/get_person/data/name" } }], dataModel: {}, done: true };
    const card = sharedComposedCard(CALLS, surface);
    expect(card?.reads.map((read) => read.tool)).toEqual(["get_person"]);
    expect(card && shareTitle(card)).toBe("ทีม คน");
  });

  test("a title comes from what was asked, never from a result", () => {
    expect(shareTitle({ kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value" } }] })).toBe("มูลค่าขายเข้า");
    expect(shareTitle({ kind: "tool", reads: [{ tool: "find_people", input: {} }] })).toBe("คนและทีม");
  });
});
