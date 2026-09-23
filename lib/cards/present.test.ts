import { describe, expect, test } from "bun:test";
import type { Dim, Grain, MetricId, MetricQuery, MetricResult } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { presentCard, type CardBody, type CardView, type SortBy } from "./present";

const CEO = accessFor(findUser("u_thana")!);
const AUGUST = { from: "2026-08-01", to: "2026-08-31" };
const SIX_MONTHS = { from: "2026-03-01", to: "2026-08-31" };
const LAST_30_DAYS = { from: "2026-08-01", to: "2026-08-30" };

type Ask = { metric: MetricId; dims: Dim[]; range?: { from: string; to: string }; grain?: Grain; compare?: MetricQuery["compare"] };

function queryOf(ask: Ask): MetricQuery {
  return { metric: ask.metric, dims: ask.dims, filters: {}, range: ask.range ?? AUGUST, grain: ask.grain ?? "month", compare: ask.compare ?? "prev_period", limit: null };
}

function answer(ask: Ask): { query: MetricQuery; result: MetricResult } {
  const query = queryOf(ask);
  return { query, result: runMetric(query, CEO) };
}

function bodyOf(ask: Ask, options: { view?: CardView; sortBy?: SortBy; others?: Ask[] } = {}): CardBody {
  const { query, result } = answer(ask);
  return presentCard({ title: "t", query, result, view: options.view, sortBy: options.sortBy, others: options.others?.map(answer) }).body;
}

function expectKind<K extends CardBody["kind"]>(body: CardBody, kind: K): Extract<CardBody, { kind: K }> {
  expect(body.kind).toBe(kind);
  return body as Extract<CardBody, { kind: K }>;
}

describe("time × group", () => {
  test("a sum over six months by region stacks as bars, the sixth region folded into อื่น ๆ", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["month", "region"], range: SIX_MONTHS }), "stacked");
    expect(body.shape).toBe("bar");
    expect(body.labels).toHaveLength(6);
    expect(body.series).toHaveLength(5);
    expect(body.series[4].name).toBe("อื่น ๆ");
    expect(body.series.every((series) => series.values.length === 6)).toBe(true);
  });

  test("the scope line counts regions, not region × month rows", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["month", "region"], range: SIX_MONTHS });
    expect(presentCard({ title: "t", query, result }).meta).toContain("6 ภาค");
  });

  test("a sum over thirty days by channel stacks as an area", () => {
    const body = expectKind(bodyOf({ metric: "sell_out_volume", dims: ["date", "channel"], range: LAST_30_DAYS, grain: "day" }), "stacked");
    expect(body.shape).toBe("area");
    expect(body.labels.length).toBeGreaterThan(12);
  });

  test("an average by four channels is one line per channel, never one zig-zag line", () => {
    const body = expectKind(bodyOf({ metric: "target_attainment", dims: ["month", "channel"], range: SIX_MONTHS }), "line");
    expect(body.series.length).toBeGreaterThanOrEqual(3);
    expect(body.series.length).toBeLessThanOrEqual(5);
    expect(body.labels).toHaveLength(6);
  });

  test("an average by more than five groups becomes a heatmap of groups × months", () => {
    const body = expectKind(bodyOf({ metric: "target_attainment", dims: ["month", "region"], range: SIX_MONTHS }), "heatmap");
    expect(body.rowLabels).toHaveLength(6);
    expect(body.columnLabels).toHaveLength(6);
    expect(body.scale).toBe("value");
  });

  test("a single series stays one line, plus the dashed compare window", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS }), "line");
    expect(body.series.map((series) => series.style)).toEqual([null, "dashed"]);
  });
});

describe("two groups", () => {
  test("region × channel is a heatmap coloured by the change when a compare is asked", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["region", "channel"] }), "heatmap");
    expect(body.rowLabels).toHaveLength(6);
    expect(body.columnLabels.length).toBeGreaterThanOrEqual(3);
    expect(body.scale).toBe("delta");
    const cells = body.cells.flat().filter((cell) => cell !== null);
    expect(cells.length).toBe(body.rowLabels.length * body.columnLabels.length);
    expect(cells.every((cell) => cell.intensity >= 0 && cell.intensity <= 1)).toBe(true);
    expect(cells.every((cell) => /%$/.test(cell.text) && cell.detail !== null)).toBe(true);
  });
});

describe("ranked bars follow the order", () => {
  test("ordered by what fell, the longest bar is the biggest drop", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["agent"] }, { sortBy: "delta_asc" }), "rank");
    expect(body.rows[0].share).toBe(1);
    const shares = body.rows.map((row) => row.share ?? 0);
    expect(shares).toEqual([...shares].sort((left, right) => right - left));
  });

  test("the query's own sort orders the card when the card names none, so a pinned card keeps it", () => {
    const query = { ...queryOf({ metric: "net_sales_volume", dims: ["agent"] }), limit: 5, sort: "delta_asc" as const };
    const body = expectKind(presentCard({ title: "t", query, result: runMetric(query, CEO) }).body, "rank");
    expect(body.rows[0].share).toBe(1);
  });
});

describe("heatmap rows follow the order", () => {
  test("asked what fell, the region that fell most on average leads", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["region", "channel"] }, { sortBy: "delta_asc" }), "heatmap");
    const average = (row: (typeof body.cells)[number]) => row.reduce((sum, cell) => sum + Number((cell?.text ?? "0").replace("%", "").replace("−", "-")), 0) / row.length;
    const averages = body.cells.map(average);
    expect(averages[0]).toBeLessThanOrEqual(averages[averages.length - 1]);
  });
});

describe("tables become ranked bars", () => {
  test("a table asked for a breakdown draws ranked bars with the change on each row", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["agent"] }, { view: "table" }), "rank");
    expect(body.rows.every((row) => row.share !== null && row.delta !== null)).toBe(true);
  });

  test("kv on a breakdown is ranked bars too", () => {
    expect(bodyOf({ metric: "stock_on_hand", dims: ["sku"] }, { view: "kv" }).kind).toBe("rank");
  });

  test("a sparse DC × SKU top list is ranked bars, not a mostly empty heatmap", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc", "sku"] });
    const top = { ...query, limit: 8 };
    const card = presentCard({ title: "t", query: top, result: runMetric(top, CEO), view: "table" });
    expect(card.body.kind).toBe("rank");
    expect(result.ok).toBe(true);
  });

  test("a time series asked as a table stays a table", () => {
    expect(bodyOf({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS }, { view: "table" }).kind).toBe("table");
  });
});

describe("geography", () => {
  test("provinces are ranked bars in the order the question asked", () => {
    const body = expectKind(bodyOf({ metric: "sell_out_volume", dims: ["province"] }, { sortBy: "delta_asc" }), "rank");
    expect(body.rows[0].share).toBe(1);
  });

  test("regions are ranked bars", () => {
    expect(bodyOf({ metric: "net_sales_volume", dims: ["region"] }).kind).toBe("rank");
  });
});

describe("parts of a whole", () => {
  test("sales value by channel is a donut whose slices add up to the whole", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_value", dims: ["channel"] }), "share");
    const total = body.slices.reduce((sum, slice) => sum + slice.share, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(body.centerLabel).toBe(body.slices[0].label);
  });

  test("a question about what dropped keeps the ranked list, a donut cannot show change", () => {
    expect(bodyOf({ metric: "net_sales_value", dims: ["channel"] }, { sortBy: "delta_asc" }).kind).toBe("rank");
  });

  test("market share by maker is a donut led by our own share", () => {
    const body = expectKind(bodyOf({ metric: "market_share", dims: ["maker"] }), "share");
    expect(body.slices[0].label).toBe("บุญรอดบริวเวอรี่");
    expect(body.centerValue).toMatch(/%$/);
  });

  test("an average cannot be a donut: attainment by channel stays ranked", () => {
    expect(bodyOf({ metric: "target_attainment", dims: ["channel"] }, { view: "share" }).kind).toBe("rank");
  });
});

describe("two metrics on one card", () => {
  test("sales against overdue money by agent is a scatter with named outliers and a correlation note", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_value", dims: ["agent"] }, { others: [{ metric: "ar_overdue", dims: ["agent"] }] }), "scatter");
    expect(body.points.length).toBeGreaterThanOrEqual(4);
    expect(body.points.filter((point) => point.named).length).toBe(4);
    expect(body.note).toMatch(/r = /);
    expect(body.x.label).not.toBe(body.y.label);
    expect(body.diagonal).toBeNull();
  });

  test("sell-in against sell-out shares a scale, so the card draws the parity line", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["agent"] }, { others: [{ metric: "sell_out_volume", dims: ["agent"] }] }), "scatter");
    expect(body.diagonal).not.toBeNull();
  });

  test("produced → sold in → sold out is a funnel in the order given", () => {
    const body = expectKind(
      bodyOf({ metric: "production_output", dims: [] }, { others: [{ metric: "net_sales_volume", dims: [] }, { metric: "sell_out_volume", dims: [] }] }),
      "funnel",
    );
    expect(body.stages).toHaveLength(3);
    expect(body.stages[0].dropText).toBeNull();
    expect(body.stages[1].dropText).toMatch(/จากขั้นก่อน$/);
    expect(Math.max(...body.stages.map((stage) => stage.width))).toBe(1);
  });

  test("metrics in different units over the same months are indexed lines", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS });
    const card = presentCard({ title: "t", query, result, others: [answer({ metric: "campaign_spend", dims: ["month"], range: SIX_MONTHS })] });
    const body = expectKind(card.body, "line");
    expect(body.series).toHaveLength(2);
    expect(card.footnote).toContain("ดัชนี");
  });

  test("results that do not fit together fall back to the first card", () => {
    expect(bodyOf({ metric: "net_sales_volume", dims: ["region"] }, { others: [{ metric: "headcount", dims: ["department"] }] }).kind).toBe("rank");
  });
});
