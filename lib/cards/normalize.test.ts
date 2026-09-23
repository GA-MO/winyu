import { describe, expect, test } from "bun:test";
import type { Spec } from "vexa/protocol";
import { normalizeCopSpec } from "./normalize";

const SUMMARY = "ปริมาณขายเข้า (Sell-in) 1 ก.ย. 2569 – 22 ก.ย. 2569: รวม 18.7 ล้านลิตร · เทียบช่วงก่อนหน้า -7.6%";

const ANSWER = {
  query: { metric: "net_sales_volume", dims: ["agent"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 10 },
  headline: { aggregate: "sum", value: "18.7 ล้านลิตร", periodLabel: "1 ก.ย. 2569 – 22 ก.ย. 2569", rowCount: 10, deltaPercent: -7.6, compareLabel: "เทียบช่วงก่อนหน้า", top: [] },
  provenance: { metric: "net_sales_volume", certified: true, sourceSystem: "SAP SD", asOf: "2026-09-22", rowCount: 10, filtersApplied: {}, scopeApplied: {}, masked: [], trust: "verified" },
  summary: SUMMARY,
};

const OUTPUTS = { "/tools/query_metric": ANSWER };

function specOf(elements: Record<string, unknown>): Spec {
  return { root: "card", elements } as unknown as Spec;
}

function cardProps(spec: Spec): Record<string, unknown> {
  return (spec.elements as Record<string, { props: Record<string, unknown> }>).card.props;
}

describe("normalizeCopSpec", () => {
  test("drops a description that only repeats the tool summary", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "เอเย่นต์", description: SUMMARY }, children: [] } });
    expect(cardProps(normalizeCopSpec(spec, { toolOutputs: OUTPUTS })).description).toBeNull();
  });

  test("fills the scope and source lines a hand-drawn card left out", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "เอเย่นต์" }, children: [] } });
    const props = cardProps(normalizeCopSpec(spec, { toolOutputs: OUTPUTS }));
    expect(props.meta).toBe("1 ก.ย. 2569 – 22 ก.ย. 2569 · 10 เอเย่นต์");
    expect(props.footnote).toContain("SAP SD");
  });

  test("keeps a description the model wrote itself", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "เอเย่นต์", description: "เรียงจากที่ตกแรงที่สุด" }, children: [] } });
    expect(cardProps(normalizeCopSpec(spec, { toolOutputs: OUTPUTS })).description).toBe("เรียงจากที่ตกแรงที่สุด");
  });

  test("right-aligns number columns and colours a signed percentage column", () => {
    const spec = specOf({
      card: {
        type: "Table",
        props: {
          columns: [{ key: "agent", label: "เอเย่นต์" }, { key: "value", label: "ยอดขาย" }, { key: "delta", label: "เทียบงวดก่อน" }],
          rows: [{ agent: "ส.รุ่งเรือง", value: 6449, delta: "-10.2%" }],
        },
        children: [],
      },
    });
    const columns = cardProps(normalizeCopSpec(spec, { toolOutputs: OUTPUTS })).columns as Record<string, unknown>[];
    expect(columns[0].align).toBeNull();
    expect(columns[1].align).toBe("end");
    expect(columns[2].tone).toBe("delta");
  });

  test("leaves a spec alone when no tool answered", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "ว่าง" }, children: [] } });
    expect(normalizeCopSpec(spec, { toolOutputs: {} })).toBe(spec);
  });
});
