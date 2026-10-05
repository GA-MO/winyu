import { describe, expect, test } from "bun:test";
import type { Dim, Grain, MetricId, MetricQuery, MetricResult } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { TH } from "@/lib/i18n/th";
import { LOW_COVER_DAYS } from "@/lib/semantic/metrics";
import { presentCard, presentForecast, weakestRow, type CardBody, type CardView, type ForecastAnswer, type SortBy } from "./present";

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

function deltaOf(text: string | null): number {
  return Number((text ?? "0").replace("−", "-").replace("%", ""));
}

describe("bars measure the number beside them", () => {
  test("ordered by what fell, each bar is the change printed beside it, the biggest drop first, the level in the grey detail", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["agent"] });
    const body = expectKind(presentCard({ title: "t", query, result, sortBy: "delta_asc" }).body, "gap");
    const deltas = body.rows.map((row) => deltaOf(row.gapText));
    expect(deltas).toEqual([...deltas].sort((left, right) => left - right));
    const span = Math.max(10, ...deltas.map(Math.abs));
    body.rows.forEach((row, index) => expect(row.gap).toBeCloseTo(deltas[index] / span, 2));
    expect(body.rows.every((row) => row.detail?.endsWith("ลิตร"))).toBe(true);
    expect(body.ends.less).toContain("ลดลง");
  });

  test("the query's own sort orders the card when the card names none, so a pinned card keeps it", () => {
    const query = { ...queryOf({ metric: "net_sales_volume", dims: ["agent"] }), limit: 5, sort: "delta_asc" as const };
    const body = expectKind(presentCard({ title: "t", query, result: runMetric(query, CEO) }).body, "gap");
    const deltas = body.rows.map((row) => deltaOf(row.gapText));
    expect(deltas).toEqual([...deltas].sort((left, right) => left - right));
  });

  test("attainment is drawn from the 100% target: under it grows left and reads bad, at or over it grows right", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"] });
    const body = expectKind(presentCard({ title: "t", query, result }).body, "gap");
    for (const row of body.rows) {
      const value = Number(row.gapText.replace("%", ""));
      expect(Math.sign(row.gap)).toBe(Math.sign(value - 100));
      if (value < 98) expect(row.tone).toBe("bad");
      if (value >= 100) expect(row.tone).toBe("good");
    }
    expect(body.caption).toContain("100%");
  });

  test("days of cover is drawn from the low-cover line the detector uses", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc"] });
    const body = expectKind(presentCard({ title: "t", query, result }).body, "gap");
    for (const row of body.rows) {
      const days = Number(row.gapText.replace(/[^\d.]/g, ""));
      expect(row.tone).toBe(days < LOW_COVER_DAYS ? "bad" : "neutral");
    }
    expect(body.caption).toContain(String(LOW_COVER_DAYS));
  });

  test("the scope line says so when the card draws fewer rows than the result holds", () => {
    const query = { ...queryOf({ metric: "ar_overdue", dims: ["agent"] }), limit: 10 };
    const card = presentCard({ title: "t", query, result: runMetric(query, CEO) });
    expect(expectKind(card.body, "rank").rows).toHaveLength(8);
    expect(card.meta).toContain("แสดง 8 จาก 10 เอเย่นต์");
  });

  test("attainment lists the furthest under target first, and a change sort with nothing to compare keeps that order", () => {
    const query = queryOf({ metric: "target_attainment", dims: ["province"], compare: "none" });
    const plain = runMetric(query, CEO);
    const byChange = runMetric({ ...query, sort: "delta_asc" }, CEO);
    if (!plain.ok || !byChange.ok) throw new Error("query failed");
    const values = plain.rows.map((row) => Number(row.value));
    expect(values).toEqual([...values].sort((left, right) => left - right));
    expect(byChange.rows.map((row) => row.province)).toEqual(plain.rows.map((row) => row.province));
  });

  test("a level list with no deciding line keeps ranked bars from zero", () => {
    expect(bodyOf({ metric: "ar_overdue", dims: ["region"] }).kind).toBe("rank");
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

  test("a sparse DC × SKU top list is bars against the low-cover line, not a mostly empty heatmap", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc", "sku"] });
    const top = { ...query, limit: 8 };
    const card = presentCard({ title: "t", query: top, result: runMetric(top, CEO), view: "table" });
    expect(card.body.kind).toBe("gap");
    expect(result.ok).toBe(true);
  });

  test("a time series asked as a table stays a table", () => {
    expect(bodyOf({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS }, { view: "table" }).kind).toBe("table");
  });
});

describe("geography", () => {
  test("provinces asked what fell draw the change, in the order the question asked", () => {
    const body = expectKind(bodyOf({ metric: "sell_out_volume", dims: ["province"] }, { sortBy: "delta_asc" }), "gap");
    const deltas = body.rows.map((row) => deltaOf(row.gapText));
    expect(deltas).toEqual([...deltas].sort((left, right) => left - right));
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

  test("a question about what dropped draws the change, a donut cannot show change", () => {
    expect(bodyOf({ metric: "net_sales_value", dims: ["channel"] }, { sortBy: "delta_asc" }).kind).toBe("gap");
  });

  test("market share by maker is a donut led by our own share", () => {
    const body = expectKind(bodyOf({ metric: "market_share", dims: ["maker"] }), "share");
    expect(body.slices[0].label).toBe("บุญรอดบริวเวอรี่");
    expect(body.centerValue).toMatch(/%$/);
  });

  test("an average cannot be a donut: attainment by channel is drawn against the target", () => {
    expect(bodyOf({ metric: "target_attainment", dims: ["channel"] }, { view: "share" }).kind).toBe("gap");
  });
});

describe("two metrics on one card", () => {
  test("sales against overdue money by agent is a scatter with named outliers and a correlation note", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_value", dims: ["agent"] }, { others: [{ metric: "ar_overdue", dims: ["agent"] }] }), "scatter");
    expect(body.points.length).toBeGreaterThanOrEqual(4);
    expect(body.points.filter((point) => point.named).length).toBe(4);
    expect(body.note).toMatch(/r = /);
    expect(body.x.label).not.toBe(body.y.label);
  });

  test("sell-in against sell-out is one gap bar per agent, widest shortfall first, with the overall ratio as the headline", () => {
    const first = answer({ metric: "net_sales_volume", dims: ["agent"] });
    const card = presentCard({ title: "t", query: first.query, result: first.result, others: [answer({ metric: "sell_out_volume", dims: ["agent"] })] });
    const body = expectKind(card.body, "gap");
    expect(body.rows.length).toBeGreaterThanOrEqual(2);
    const gaps = body.rows.map((row) => row.gap);
    expect(gaps).toEqual([...gaps].sort((left, right) => left - right));
    expect(Math.max(...gaps.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(body.rows[0].detail).toContain("→");
    expect(card.hero?.value).toMatch(/%$/);
    expect(card.hero?.detail).toMatch(/เอเย่นต์/);
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

describe("a rate over time", () => {
  const TWELVE_MONTHS_TO_SEPTEMBER = { from: "2025-10-01", to: "2026-09-30" };

  test("the hero is the latest full month against the one before, and the running month is cut on the day the data stops", () => {
    const { query, result } = answer({ metric: "attrition_rate", dims: ["month"], range: TWELVE_MONTHS_TO_SEPTEMBER, compare: "none" });
    const card = presentCard({ title: "t", query, result });
    const line = expectKind(card.body, "line");
    expect(line.labels).toHaveLength(11);
    expect(card.footnote).toContain("เดือนปัจจุบันยังไม่ครบ");
    expect(card.hero?.label).toBe(`อัตราการลาออกต่อเดือน · ${line.labels[10]}`);
    expect(card.hero?.detail).toBe(`เทียบ ${line.labels[9]}`);
    expect(card.hero?.delta).not.toBeNull();
  });

  test("a sum over time keeps the period total as its hero", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS, compare: "none" });
    expect(presentCard({ title: "t", query, result }).hero?.value).toBe(result.ok ? result.headline.value : "");
  });

  test("a year-on-year card says why it starts later than asked", () => {
    const { query, result } = answer({ metric: "attrition_rate", dims: ["department"], range: { from: "2026-01-01", to: "2026-08-31" }, compare: "prev_year" });
    const card = presentCard({ title: "t", query, result });
    expect(card.meta?.startsWith("1 เม.ย. 2569")).toBe(true);
    expect(card.footnote).toContain("เทียบปีก่อนได้ตั้งแต่");
    expect(card.hero?.delta).not.toBeNull();
  });
});

describe("the headline says what it stands for", () => {
  test("a capped breakdown's total is labelled as every group in scope and the scope line says how many are shown", () => {
    const query = { ...queryOf({ metric: "net_sales_volume", dims: ["agent"] }), limit: 5, sort: "delta_asc" as const };
    const card = presentCard({ title: "t", query, result: runMetric(query, CEO) });
    expect(card.hero?.label).toBe("ปริมาณขายเข้า (Sell-in) รวมทุกเอเย่นต์");
    expect(card.meta).toContain("แสดง 5 เอเย่นต์");
  });

  test("an average across provinces says it is an average", () => {
    const card = presentCard({ title: "t", ...answer({ metric: "market_share", dims: ["province"] }) });
    expect(card.hero?.label).toContain("เฉลี่ยทุกจังหวัด");
  });

  test("a filter the question narrowed to shows on the scope line", () => {
    const query = { ...queryOf({ metric: "days_of_cover", dims: ["dc"] }), filters: { sku: ["sku_purra_pet600"] } };
    const card = presentCard({ title: "t", query, result: runMetric(query, CEO) });
    expect(card.meta).toContain("เฉพาะ เพอร์ร่า");
  });
});

describe("forecast card", () => {
  const FORECAST: ForecastAnswer = {
    metric: "net_sales_volume",
    total: 300,
    mape: 13.4,
    weeks: [
      { week: "W40", date: "2026-09-28", value: 100, lo: 90, hi: 110, value_label: "100 ลิตร" },
      { week: "W41", date: "2026-10-05", value: 100, lo: 85, hi: 115, value_label: "100 ลิตร" },
      { week: "W42", date: "2026-10-12", value: 100, lo: 80, hi: 120, value_label: "100 ลิตร" },
    ],
  };

  test("the error is a caption, never a change, and the headline is the forecast total", () => {
    const parts = presentForecast({ title: "t", forecast: FORECAST, history: null });
    expect(parts.hero?.delta).toBeNull();
    expect(parts.hero?.detail).toContain("MAPE");
    expect(parts.hero?.value).toContain("300");
  });

  test("the forecast and its band start at the last actual week so the lines join", () => {
    const history = answer({ metric: "net_sales_volume", dims: ["week"], grain: "week", range: { from: "2026-07-27", to: "2026-09-20" }, compare: "none" });
    const body = expectKind(presentForecast({ title: "t", forecast: FORECAST, history }).body, "forecast");
    const lastActual = body.actual.filter((value) => value !== null).length - 1;
    expect(body.labels).toHaveLength(lastActual + 1 + FORECAST.weeks.length);
    expect(body.forecast[lastActual]).toBe(body.actual[lastActual]);
    expect(body.hi.slice(lastActual + 1)).toEqual([110, 115, 120]);
    expect(body.forecast.slice(0, lastActual).every((value) => value === null)).toBe(true);
  });
});

describe("every value masked", () => {
  test("becomes one line instead of a card of ***", () => {
    const query = queryOf({ metric: "avg_salary", dims: ["department"], compare: "none" });
    const result: MetricResult = {
      ok: true,
      rows: [{ department: "ขาย", value: "***", value_label: "***" }, { department: "ไอที", value: "***", value_label: "***" }],
      summary: "",
      headline: { aggregate: "average", value: "—", periodLabel: "ส.ค. 2569", rowCount: 2, deltaPercent: null, compareLabel: null, compareNote: null, top: [] },
      provenance: { metric: "avg_salary", certified: true, sourceSystem: "HRIS", asOf: "2026-09-22", rowCount: 2, filtersApplied: {}, scopeApplied: {}, masked: ["value"], trust: "verified" },
    };
    const parts = presentCard({ title: "t", query, result });
    expect(parts.denied?.body).toContain("ฝ่าย");
    expect(parts.body.kind).toBe("none");
  });
});

describe("target in a running month", () => {
  test("says the target is counted to the last day of data and how much of the month that is", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"], range: { from: "2026-09-01", to: "2026-09-30" }, compare: "none" });
    const parts = presentCard({ title: "t", query, result });
    expect(parts.hero?.detail).toBe(TH.dash.paceTarget("22 ก.ย. 2569", "73%"));
  });

  test("a closed month needs no pace line", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"], compare: "none" });
    expect(presentCard({ title: "t", query, result }).hero?.detail ?? null).toBeNull();
  });
});

describe("rows too small to show", () => {
  test("leave the card and are counted in the scope line instead of drawn as ***", () => {
    const { query, result } = answer({ metric: "ar_overdue", dims: ["province"], range: { from: "2026-09-01", to: "2026-09-22" }, compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const hidden = result.rows.filter((row) => row.value === "***").length;
    expect(hidden).toBeGreaterThan(0);
    const parts = presentCard({ title: "t", query, result });
    expect(parts.meta).toContain(TH.dash.hiddenSmall(hidden, "จังหวัด", 3));
    expect(JSON.stringify(parts.body)).not.toContain("***");
    expect(parts.hero).toBeNull();
  });

  test("a single row left still shows its number", () => {
    const { query, result } = answer({ metric: "ar_overdue", dims: ["province"], range: { from: "2026-09-01", to: "2026-09-22" }, compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const lone = { ...result, rows: [result.rows.find((row) => row.value !== "***"), ...result.rows.filter((row) => row.value === "***")].filter((row) => row !== undefined) };
    const body = presentCard({ title: "t", query, result: lone }).body;
    expect(body.kind).toBe("table");
  });
});

describe("a target card in a month still running", () => {
  test("under the headline, its own line says where the month ends when the result carries a projection", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["region"], range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target" });
    if (!result.ok) throw new Error(result.error);
    const projection = { recentDays: 7, projected: "10.2 ล้านลิตร", monthTarget: "11.3 ล้านลิตร", attainment: "90.6%" };
    const hero = presentCard({ title: "t", query, result: { ...result, headline: { ...result.headline, projection } } }).hero;
    expect(hero?.detail).toBe(TH.dash.paceTarget("22 ก.ย. 2569", "73%"));
    expect(hero?.note).toBe(TH.dash.monthEnd(projection));
  });
});

describe("a breakdown whose level decides", () => {
  test("cover leads with how many groups sit under the low-cover line, counted over every group before the row cap, and names the lowest", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc"], compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const every = result.rows.map((row) => Number(row.value));
    const top = { ...query, limit: 2 };
    const capped = runMetric(top, CEO);
    if (!capped.ok) throw new Error(capped.error);
    expect(capped.rows).toHaveLength(2);
    expect(capped.headline.underLine).toEqual({ line: LOW_COVER_DAYS, count: every.filter((days) => days < LOW_COVER_DAYS).length, of: every.length });
    const hero = presentCard({ title: "t", query: top, result: capped }).hero;
    expect(hero?.label).toBe(TH.dash.underCover(LOW_COVER_DAYS));
    const under = capped.headline.underLine;
    expect(hero?.value).toBe(under && under.count > 0 ? TH.dash.countOf(under.count, under.of, TH.dash.dimUnit.dc) : TH.dash.noneUnder);
    const worst = weakestRow(top, capped);
    expect(hero?.note).toContain(TH.dash.weakest(true, worst?.label ?? "", worst?.value ?? ""));
    expect(presentCard({ title: "t", query: top, result: capped }).meta).toContain(TH.dash.shownRowsOf(2, every.length, TH.dash.dimUnit.dc));
  });

  test("asked only for the rows under the line, the count still reads against every group", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc", "sku"], compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const below = runMetric({ ...query, where: { op: "below", value: LOW_COVER_DAYS } }, CEO);
    if (!below.ok) throw new Error(below.error);
    expect(below.headline.underLine).toEqual(result.headline.underLine ?? null);
    expect(below.headline.underLine?.of).toBeGreaterThan(below.headline.underLine?.count ?? 0);
  });

  test("attainment by region leads with the regions under target and keeps the overall level beside the lowest", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"] });
    if (!result.ok) throw new Error(result.error);
    const under = result.rows.filter((row) => Number(row.value) < 100).length;
    const hero = presentCard({ title: "t", query, result }).hero;
    expect(hero?.label).toBe(TH.dash.underTarget);
    expect(hero?.value).toBe(under > 0 ? TH.dash.countOf(under, result.rows.length, TH.dash.dimUnit.region) : TH.dash.noneUnder);
    expect(hero?.note).toContain(result.headline.value);
  });

  test("a trend of cover over time keeps its level headline, there is nothing to count", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["week"], grain: "week", range: SIX_MONTHS });
    if (!result.ok) throw new Error(result.error);
    expect(result.headline.underLine ?? null).toBeNull();
    expect(presentCard({ title: "t", query, result }).hero?.label).not.toBe(TH.dash.underCover(LOW_COVER_DAYS));
  });

  test("a total with no level to decide on keeps its headline alone", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["region"] });
    expect(presentCard({ title: "t", query, result }).hero?.note).toBeNull();
  });
});
