import { describe, expect, test } from "bun:test";
import type { Spec } from "vexa/protocol";
import { normalizeWinyuSpec } from "./normalize";

const SUMMARY = "ปริมาณขายเข้า (Sell-in) 1 ก.ย. 2569 – 22 ก.ย. 2569: รวม 18.7 ล้านลิตร · เทียบช่วงก่อนหน้า -7.6%";

const ANSWER = {
  query: { metric: "net_sales_volume", dims: ["agent"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 10 },
  headline: { aggregate: "sum", value: "18.7 ล้านลิตร", periodLabel: "1 ก.ย. 2569 – 22 ก.ย. 2569", rowCount: 10, deltaPercent: -7.6, compareLabel: "เทียบช่วงก่อนหน้า", compareNote: null, top: [] },
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

describe("normalizeWinyuSpec", () => {
  test("drops a description that only repeats the tool summary", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "เอเย่นต์", description: SUMMARY }, children: [] } });
    expect(cardProps(normalizeWinyuSpec(spec, { toolOutputs: OUTPUTS })).description).toBeNull();
  });

  test("fills the scope and source lines a hand-drawn card left out", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "เอเย่นต์" }, children: [] } });
    const props = cardProps(normalizeWinyuSpec(spec, { toolOutputs: OUTPUTS }));
    expect(props.meta).toBe("1 ก.ย. 2569 – 22 ก.ย. 2569 · 10 เอเย่นต์");
    expect(props.footnote).toContain("SAP SD");
  });

  test("a card drawn in a later turn takes no scope line from an earlier turn's metric call", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "นโยบายเบิกค่าเดินทาง" }, children: [] } });
    const props = cardProps(normalizeWinyuSpec(spec, { toolOutputs: OUTPUTS, turnToolOutputs: { "/tools/get_policy": { ok: true } } }));
    expect(props.meta).toBeUndefined();
  });

  test("keeps a description the model wrote itself", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "เอเย่นต์", description: "เรียงจากที่ตกแรงที่สุด" }, children: [] } });
    expect(cardProps(normalizeWinyuSpec(spec, { toolOutputs: OUTPUTS })).description).toBe("เรียงจากที่ตกแรงที่สุด");
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
    const columns = cardProps(normalizeWinyuSpec(spec, { toolOutputs: OUTPUTS })).columns as Record<string, unknown>[];
    expect(columns[0].align).toBeNull();
    expect(columns[1].align).toBe("end");
    expect(columns[2].tone).toBe("delta");
  });

  test("leaves a spec alone when no tool answered", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "ว่าง" }, children: [] } });
    expect(normalizeWinyuSpec(spec, { toolOutputs: {} })).toBe(spec);
  });
});

describe("composed cards", () => {
  test("a date the model added to the source line is dropped", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "ทีม", footnote: "แหล่งข้อมูล: HRIS · ณ 24 ก.ย. 2569" }, children: [] } });
    expect(cardProps(normalizeWinyuSpec(spec, { toolOutputs: {} })).footnote).toBe("แหล่งข้อมูล: HRIS");
  });

  test("a source line without a date stays untouched", () => {
    const spec = specOf({ card: { type: "Card", props: { title: "ทีม", footnote: "แหล่งข้อมูล: HRIS" }, children: [] } });
    expect(normalizeWinyuSpec(spec, { toolOutputs: {} })).toBe(spec);
  });
});

describe("pictures", () => {
  const people = { "/tools/find_people": { ok: true, summary: "พบ 2 คน", data: [{ id: "e_joy", photo: "/img/people/p08.jpg" }] } };

  function specOf(elements: Record<string, unknown>) {
    return { root: "a", elements } as unknown as Parameters<typeof normalizeWinyuSpec>[0];
  }

  test("a photo a tool returned stays", () => {
    const spec = specOf({ a: { type: "Avatar", props: { name: "คุณจอย", role: null, src: "/img/people/p08.jpg", size: "lg" }, children: [] } });
    expect(normalizeWinyuSpec(spec, { toolOutputs: people })).toBe(spec);
  });

  test("a photo the model made up falls back to initials", () => {
    const spec = specOf({ a: { type: "Avatar", props: { name: "คุณจอย", role: null, src: "/img/people/p99.jpg", size: "lg" }, children: [] } });
    const next = normalizeWinyuSpec(spec, { toolOutputs: people }) as unknown as { elements: Record<string, { props: { src: unknown } }> };
    expect(next.elements.a?.props.src).toBeNull();
  });

  test("an outside image link is dropped", () => {
    const spec = specOf({ a: { type: "Image", props: { src: "https://example.com/x.jpg", alt: "x" }, children: [] } });
    const next = normalizeWinyuSpec(spec, { toolOutputs: people }) as unknown as { elements: Record<string, { type: string }> };
    expect(next.elements.a?.type).toBe("Text");
  });
});

describe("DataCard title against its rows", () => {
  const COVER = {
    query: { metric: "days_of_cover", dims: ["sku"], filters: {}, range: { from: "2026-09-22", to: "2026-09-22" }, grain: "day", compare: "none", limit: 3, sort: "value_asc" },
    rows: [
      { sku: "สิงห์ ขวด 620 มล.", value: 7.22, value_label: "7.2 วัน" },
      { sku: "น้ำดื่มสิงห์ ขวด PET 1.5 ลิตร", value: 11.72, value_label: "11.7 วัน" },
      { sku: "สิงห์ กระป๋อง 490 มล.", value: 12.26, value_label: "12.3 วัน" },
    ],
  };

  function titleAfter(title: string): unknown {
    const spec = specOf({ card: { type: "DataCard", props: { title, source: { $state: "/tools/query_metric" } }, children: [] } });
    return cardProps(normalizeWinyuSpec(spec, { toolOutputs: { "/tools/query_metric": COVER } })).title;
  }

  test("swaps a threshold the rows do not meet for the plain metric name", () => {
    expect(titleAfter("สินค้าที่สต๊อกพอขายน้อยกว่า 10 วัน")).toBe("วันครอบคลุมสต๊อก แยกตามSKU");
  });

  test("keeps a title the rows bear out", () => {
    expect(titleAfter("สิงห์ ขวด 620 มล. สต๊อกพอขายต่ำสุด")).toBe("สิงห์ ขวด 620 มล. สต๊อกพอขายต่ำสุด");
  });
});

describe("a title that states how many rows meet its threshold", () => {
  test("is kept", () => {
    const spec = specOf({ card: { type: "DataCard", props: { title: "1 รายการที่สต๊อกพอขายน้อยกว่า 10 วัน", source: { $state: "/tools/query_metric" } }, children: [] } });
    const outputs = {
      "/tools/query_metric": {
        query: { metric: "days_of_cover", dims: ["sku"], filters: {}, range: { from: "2026-09-22", to: "2026-09-22" }, grain: "day", compare: "none", limit: 3, sort: "value_asc" },
        rows: [{ sku: "สิงห์ ขวด 620 มล.", value: 7.2 }, { sku: "ลีโอ แพ็ก 12", value: 11.7 }, { sku: "อาซาฮี ถัง 30 ลิตร", value: 12.3 }],
      },
    };
    expect(cardProps(normalizeWinyuSpec(spec, { toolOutputs: outputs })).title).toBe("1 รายการที่สต๊อกพอขายน้อยกว่า 10 วัน");
  });
});

describe("a title with two claims in one clause", () => {
  test("reads the superlative as volume when no change verb sits before it", () => {
    const spec = specOf({ card: { type: "DataCard", props: { title: "โมเดิร์นเทรดมียอดขายออกสูงสุด ทุกช่องทางลดลงเทียบช่วงก่อนหน้า", source: { $state: "/tools/query_metric.2" } }, children: [] } });
    const outputs = {
      "/tools/query_metric.2": {
        query: { metric: "sell_out_volume", dims: ["channel"], filters: {}, range: { from: "2026-08-26", to: "2026-09-22" }, grain: "week", compare: "prev_period", limit: 10, sort: "value_desc" },
        rows: [
          { channel: "โมเดิร์นเทรด", value: 9630722, delta_pct: -12.8 },
          { channel: "ร้านค้าปลีกดั้งเดิม", value: 8022130, delta_pct: -13.1 },
          { channel: "ส่งออก", value: 623251, delta_pct: -12.7 },
        ],
      },
    };
    expect(cardProps(normalizeWinyuSpec(spec, { toolOutputs: outputs })).title).toBe("โมเดิร์นเทรดมียอดขายออกสูงสุด ทุกช่องทางลดลงเทียบช่วงก่อนหน้า");
  });
});

describe("a title that states how many rows moved", () => {
  const OUTPUTS = {
    "/tools/query_metric": {
      query: { metric: "ar_overdue", dims: ["agent"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 5, sort: "delta_desc" },
      rows: [
        { agent: "พัทยาซันไชน์ ซัพพลาย", value: 4152386, delta_pct: 11.2 },
        { agent: "นนท์เจริญพาณิชย์", value: 3164047, delta_pct: 9.5 },
        { agent: "สมุทรพรทวี", value: 3370648, delta_pct: -1.1 },
        { agent: "กรุงไทยเบเวอเรจ", value: 5478090, delta_pct: -1.9 },
        { agent: "บางพลีค้าส่ง", value: 2300000, delta_pct: -4.9 },
      ],
    },
  };

  function titleAfter(title: string): unknown {
    const spec = specOf({ card: { type: "DataCard", props: { title, source: { $state: "/tools/query_metric" } }, children: [] } });
    return cardProps(normalizeWinyuSpec(spec, { toolOutputs: OUTPUTS })).title;
  }

  test("is kept when the count is right", () => {
    expect(titleAfter("2 เอเย่นต์ที่หนี้ค้างเพิ่มขึ้น")).toBe("2 เอเย่นต์ที่หนี้ค้างเพิ่มขึ้น");
  });

  test("is swapped when the count is wrong", () => {
    expect(titleAfter("4 เอเย่นต์ที่หนี้ค้างเพิ่มขึ้น")).not.toBe("4 เอเย่นต์ที่หนี้ค้างเพิ่มขึ้น");
  });
});
