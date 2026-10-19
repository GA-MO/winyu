import { describe, expect, test } from "bun:test";
import type { Dim, Grain, MetricId, MetricQuery, MetricResult, NextAction } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { addDays, DATA_AS_OF, daysBetween, formatThaiDate, monthEnd, monthStart, weekKeyOfIso } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { periodLabelTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { LOW_COVER_DAYS } from "@/lib/semantic/metrics";
import { changeToneOf, formatChange, formatMetricValue, metricLabel } from "@/lib/dashboard/metric-display";
import { pairedIndexes, presentCard, presentForecast, presentGap, subjectOf, weakestRow, type CardBody, type CardParts, type CardView, type ForecastAnswer, type GapAnswer, type SortBy } from "./present";
import { spaced, type ReadRow, type Strip } from "./reading";
import { metricTitle } from "./tool-answers";

const CEO = accessFor(findUser("u_thana")!);
const AUGUST = { from: "2026-08-01", to: "2026-08-31" };
const MONTH_TO_DATE = { from: monthStart(DATA_AS_OF), to: DATA_AS_OF };
const MONTH_ELAPSED = `${Math.round((daysBetween(monthStart(DATA_AS_OF), DATA_AS_OF) + 1) / (daysBetween(monthStart(DATA_AS_OF), monthEnd(DATA_AS_OF)) + 1) * 100)}%`;
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

function stripOf(body: CardBody): Strip {
  return expectKind(body, "strip").strip;
}

function cardOf(ask: Ask, options: { limit?: number; sort?: SortBy; view?: CardView; filters?: MetricQuery["filters"] } = {}): CardParts {
  const query = { ...queryOf(ask), limit: options.limit ?? null, sort: options.sort ?? null, filters: options.filters ?? {} };
  return presentCard({ title: "t", query, result: runMetric(query, CEO), view: options.view });
}

function measures(rows: readonly ReadRow[]): number[] {
  return rows.flatMap((row) => (row.measure === null ? [] : [row.measure]));
}

describe("time × group", () => {
  test("groups over a single month are a breakdown by the groups, never a line of lone dots, and the title drops the month split (AI-69)", () => {
    const { query, result } = answer({ metric: "gross_margin", dims: ["month", "business_unit"] });
    const card = presentCard({ title: "t", query, result });
    expect(stripOf(card.body).rows.length).toBeGreaterThan(1);
    expect(card.hero?.label).toBe(TH.read.averageOf(TH.dash.dimUnit.business_unit));
    expect(metricTitle(result, query)).not.toContain(TH.dash.dimUnit.month);
  });

  test("a rate by group over two months is a grid, not two-point lines (AI-69)", () => {
    expect(bodyOf({ metric: "gross_margin", dims: ["month", "business_unit"], range: { from: "2026-07-01", to: "2026-08-31" } }).kind).toBe("heatmap");
  });

  test("a sum over six months by region stacks as bars, the sixth region folded into อื่น ๆ", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["month", "region"], range: SIX_MONTHS }), "stacked");
    expect(body.shape).toBe("bar");
    expect(body.labels).toHaveLength(6);
    expect(body.series).toHaveLength(5);
    expect(body.series[4].name).toBe("อื่น ๆ");
    expect(body.series.every((series) => series.values.length === 6)).toBe(true);
  });

  test("the verdict names the region that is largest over the whole range, and the style keeps the chart", () => {
    const card = cardOf({ metric: "net_sales_volume", dims: ["month", "region"], range: SIX_MONTHS });
    expect(card.style).toBe("chart");
    expect(card.verdict).toEndWith("ใหญ่สุดทั้งช่วง");
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
    expect(cells.every((cell) => /^([+-][\d.]+|0)$/.test(cell.text) && /%/.test(cell.detail ?? ""))).toBe(true);
    expect(body.unit).toBe("%");
  });

  test("a grid of volumes writes every cell on one scale with no unit, the unit named once, so no cell needs cutting", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["region", "brand"], compare: "none" }), "heatmap");
    const cells = body.cells.flat().filter((cell) => cell !== null);
    expect(body.unit).toBe("ล้านลิตร");
    expect(cells.every((cell) => /^\d+(\.\d+)?$/.test(cell.text) && cell.text.length <= 5)).toBe(true);
    expect(new Set(cells.map((cell) => cell.text.split(".")[1]?.length ?? 0)).size).toBe(1);
  });
});

describe("bars measure the number beside them", () => {
  test("ordered by what fell, each bar is the change printed beside it, the biggest drop first, around zero (B)", () => {
    const card = cardOf({ metric: "net_sales_volume", dims: ["agent"] }, { limit: 8, sort: "delta_asc" });
    expect(card.style).toBe("picture");
    const strip = stripOf(card.body);
    expect(strip.baseline).toBe(0);
    expect(measures(strip.rows)).toEqual([...measures(strip.rows)].sort((left, right) => left - right));
    expect(strip.rows.every((row) => row.text.endsWith("%"))).toBe(true);
    expect(strip.overall?.measure).toBeLessThanOrEqual(measures(strip.rows)[0]);
    expect(strip.total?.startsWith("รวมทุกเอเย่นต์")).toBe(true);
  });

  test("the query's own sort orders the card when the card names none, so a pinned card keeps it", () => {
    const strip = stripOf(cardOf({ metric: "net_sales_volume", dims: ["agent"] }, { limit: 5, sort: "delta_asc" }).body);
    expect(measures(strip.rows)).toEqual([...measures(strip.rows)].sort((left, right) => left - right));
  });

  test("attainment is drawn around the 100% target: only rows under it are exceptions, red", () => {
    const strip = stripOf(cardOf({ metric: "target_attainment", dims: ["region"] }).body);
    expect(strip.baseline).toBe(100);
    for (const row of strip.rows) {
      expect(row.exception).toBe((row.measure ?? 100) < 100);
      expect(row.tone).toBe((row.measure ?? 100) < 100 ? "bad" : "neutral");
    }
  });

  test("days of cover is drawn around the low-cover line the detector uses", () => {
    const strip = stripOf(cardOf({ metric: "days_of_cover", dims: ["dc"] }).body);
    expect(strip.baseline).toBe(LOW_COVER_DAYS);
    for (const row of strip.rows) if ((row.measure ?? LOW_COVER_DAYS) < LOW_COVER_DAYS) expect(row.tone).toBe("bad");
  });

  test("above 8 rows the card turns to style A: the exceptions drawn, every other row folded into one line, none lost", () => {
    const card = cardOf({ metric: "ar_overdue", dims: ["agent"] }, { limit: 10 });
    expect(card.style).toBe("exceptions");
    const body = expectKind(card.body, "exceptions");
    expect(body.strip.rows.length + (body.fold?.rows.length ?? 0)).toBe(10);
    expect(body.fold?.line).toMatch(/^(อีก|ทั้ง) \d+ เอเย่นต์/);
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

  test("a sum with no deciding line is a leaderboard: bars from zero, the biggest first, every value and change shown", () => {
    const strip = stripOf(cardOf({ metric: "ar_overdue", dims: ["region"] }).body);
    expect(strip.form).toBe("board");
    expect(measures(strip.rows)).toEqual([...measures(strip.rows)].sort((left, right) => right - left));
    expect(strip.rows.every((row) => row.valued && row.change !== null)).toBe(true);
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

describe("tables become breakdown strips", () => {
  test("a table asked for a breakdown draws the leaderboard with the change on each row", () => {
    const strip = stripOf(cardOf({ metric: "net_sales_volume", dims: ["agent"] }, { view: "table", limit: 8 }).body);
    expect(strip.form).toBe("board");
    expect(strip.rows.every((row) => row.change !== null)).toBe(true);
  });

  test("kv on a breakdown is a breakdown too", () => {
    expect(["strip", "exceptions"]).toContain(bodyOf({ metric: "stock_on_hand", dims: ["sku"] }, { view: "kv" }).kind);
  });

  test("a sparse DC × SKU top list is bars against the low-cover line, not a mostly empty heatmap", () => {
    const strip = stripOf(cardOf({ metric: "days_of_cover", dims: ["dc", "sku"] }, { limit: 8, view: "table" }).body);
    expect(strip.baseline).toBe(LOW_COVER_DAYS);
  });

  test("a time series asked as a table stays a table", () => {
    expect(bodyOf({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS }, { view: "table" }).kind).toBe("table");
  });
});

describe("geography", () => {
  test("provinces asked what fell draw the change in the order asked, the rest folded behind the exceptions", () => {
    const card = cardOf({ metric: "sell_out_volume", dims: ["province"] }, { sort: "delta_asc" });
    expect(card.style).toBe("exceptions");
    const body = expectKind(card.body, "exceptions");
    const folded = measures(body.fold?.rows ?? []);
    expect(folded).toEqual([...folded].sort((left, right) => left - right));
    for (const drawn of measures(body.strip.rows)) expect(drawn).toBeLessThanOrEqual(Math.min(...folded));
  });

  test("regions are a leaderboard", () => {
    expect(stripOf(bodyOf({ metric: "net_sales_volume", dims: ["region"] })).form).toBe("board");
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
    expect(stripOf(bodyOf({ metric: "net_sales_value", dims: ["channel"] }, { sortBy: "delta_asc" })).baseline).toBe(0);
  });

  test("market share by maker is a donut led by our own share, its centre never repeating the hero value", () => {
    const card = cardOf({ metric: "market_share", dims: ["maker"] }, { sort: "value_desc" });
    const body = expectKind(card.body, "share");
    expect(body.slices[0].label).toBe("บุญรอดบริวเวอรี่");
    expect(card.hero?.value).toBe(body.slices[0].shareText);
    expect(body.centerValue).toBe("");
    expect(card.verdict).toStartWith("บุญรอดบริวเวอรี่");
  });

  test("an average cannot be a donut: attainment by channel is drawn against the target", () => {
    expect(stripOf(bodyOf({ metric: "target_attainment", dims: ["channel"] }, { view: "share" })).baseline).toBe(100);
  });
});

describe("two metrics on one card", () => {
  test("sales against overdue money by agent is a scatter naming the few points off the trend, the correlation said in words", () => {
    const { query, result } = answer({ metric: "net_sales_value", dims: ["agent"] });
    const card = presentCard({ title: "t", query, result, others: [answer({ metric: "ar_overdue", dims: ["agent"] })] });
    const body = expectKind(card.body, "scatter");
    expect(body.points.length).toBeGreaterThanOrEqual(4);
    expect(body.points.filter((point) => point.named).length).toBeGreaterThanOrEqual(3);
    expect(card.verdict).not.toMatch(/r = |\d\.\d\d/);
    expect(body.x.label).not.toBe(body.y.label);
  });

  test("sales against overdue money by province names the province largest on each axis beside the ones off the trend, so the point a reply leans on has its name (AI-330)", () => {
    const { query, result } = answer({ metric: "net_sales_value", dims: ["province"], range: MONTH_TO_DATE, compare: "none" });
    const card = presentCard({ title: "t", query, result, others: [answer({ metric: "ar_overdue", dims: ["province"], range: MONTH_TO_DATE, compare: "none" })] });
    const body = expectKind(card.body, "scatter");
    const largest = (axis: "x" | "y") => body.points.reduce((best, point) => (point[axis] > best[axis] ? point : best));
    expect(largest("x").named).toBe(true);
    expect(largest("y").named).toBe(true);
  });

  test("sell-in against sell-out is a B breakdown around 100%: the overall share on top, the agents falling well short drawn as exceptions, no 'x → y' under any row", () => {
    const first = answer({ metric: "net_sales_volume", dims: ["agent"] });
    const card = presentCard({ title: "t", query: first.query, result: first.result, others: [answer({ metric: "sell_out_volume", dims: ["agent"] })] });
    expect(["strip", "exceptions"]).toContain(card.body.kind);
    const body = card.body as Extract<CardBody, { kind: "strip" | "exceptions" }>;
    expect(body.strip.baseline).toBe(100);
    const rows = [...body.strip.rows, ...(body.kind === "exceptions" ? (body.fold?.rows ?? []) : [])];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((row) => expect(`${row.text} ${row.sub ?? ""}`).not.toContain("→"));
    rows.filter((row) => row.exception).forEach((row) => expect(row.measure ?? 100).toBeLessThan(96));
    expect(card.hero?.value).toMatch(/%$/);
    expect(card.verdict).toMatch(/เอเย่นต์/);
  });

  test("sell-in against sell-out of the eight agents in the northeast values every row, so a grey bar a hair from the red ones still says its share (AI-332)", () => {
    const filters = { region: ["northeast"] };
    const sellIn = { ...queryOf({ metric: "net_sales_volume", dims: ["agent"], range: MONTH_TO_DATE, compare: "none" }), filters };
    const sellOut = { ...sellIn, metric: "sell_out_volume" as const };
    const card = presentCard({ title: "t", query: sellIn, result: runMetric(sellIn, CEO), others: [{ query: sellOut, result: runMetric(sellOut, CEO) }] });
    const rows = stripOf(card.body).rows;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.length).toBeLessThanOrEqual(8);
    rows.forEach((row) => expect(row.valued).toBe(true));
  });

  test("a cut never splits near-equal rows: the five northeast agents within half a point of 95% are all drawn short, and the verdict counts those five and says 'ราว 5%' (AI-332)", () => {
    const filters = { region: ["northeast"] };
    const sellIn = { ...queryOf({ metric: "net_sales_volume", dims: ["agent"], range: MONTH_TO_DATE, compare: "none" }), filters };
    const sellOut = { ...sellIn, metric: "sell_out_volume" as const };
    const card = presentCard({ title: "t", query: sellIn, result: runMetric(sellIn, CEO), others: [{ query: sellOut, result: runMetric(sellOut, CEO) }] });
    const rows = stripOf(card.body).rows;
    const red = rows.filter((row) => row.exception);
    const grey = rows.filter((row) => !row.exception);
    const closest = Math.min(...grey.map((row) => Math.min(...red.map((short) => Math.abs((row.measure ?? 0) - (short.measure ?? 0))))));
    expect(closest).toBeGreaterThan(0.5);
    expect(card.verdict).toStartWith(`${red.length} จาก ${rows.length} `);
    expect(card.verdict).toContain("ราว 5% ขึ้นไป");
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

  test("the funnel's hero says what its ratio is of: sold out over produced, not a bare 'อัตราส่วน'", () => {
    const { query, result } = answer({ metric: "production_output", dims: [] });
    const card = presentCard({ title: "t", query, result, others: [answer({ metric: "net_sales_volume", dims: [] }), answer({ metric: "sell_out_volume", dims: [] })] });
    expect(card.hero?.label).toBe(`อัตราส่วน${metricLabel("sell_out_volume").replace(/\s*\(.*\)$/, "")}ต่อ${metricLabel("production_output").replace(/\s*\(.*\)$/, "")}`);
  });

  test("metrics in different units over the same months are indexed lines", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS });
    const card = presentCard({ title: "t", query, result, others: [answer({ metric: "campaign_spend", dims: ["month"], range: SIX_MONTHS })] });
    const body = expectKind(card.body, "line");
    expect(body.series).toHaveLength(2);
    expect(card.footer?.details).toContain("ดัชนี");
  });

  test("results that do not fit together fall back to the first card", () => {
    expect(bodyOf({ metric: "net_sales_volume", dims: ["region"] }, { others: [{ metric: "headcount", dims: ["department"] }] }).kind).toBe("strip");
  });

  test("two metrics of a few groups are the first breakdown with the second value under every row, not an unlabelled scatter (AI-70)", () => {
    const first = answer({ metric: "net_sales_value", dims: ["region"] });
    const second = answer({ metric: "ar_overdue", dims: ["region"] });
    expect(pairedIndexes(first, [second])).toEqual([0]);
    const card = presentCard({ title: "t", query: first.query, result: first.result, others: [second] });
    const rows = stripOf(card.body).rows;
    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((row) => expect(row.second).toMatch(/^.+บาท( · [+−-][\d.,]+%)?$/));
    expect(card.title).toContain("ยอดค้างชำระเกินกำหนด");
  });

  test("two metrics from unrelated domains of the same groups keep their own cards: stock cover and overdue money are never merged into one strip (AI-140)", () => {
    const cover = answer({ metric: "days_of_cover", dims: ["region"], range: MONTH_TO_DATE, compare: "none" });
    const overdue = answer({ metric: "ar_overdue", dims: ["region"], range: MONTH_TO_DATE, compare: "prev_period" });
    expect(pairedIndexes(cover, [overdue])).toEqual([]);
    expect(pairedIndexes(overdue, [cover])).toEqual([]);
    const card = presentCard({ title: "t", query: cover.query, result: cover.result, others: [overdue] });
    expect(card.title).toBe("t");
    stripOf(card.body).rows.forEach((row) => expect(row.second).toBeNull());
  });

  test("the second metric keeps its change: margin against last year under each region and beside the overall row (AI-124)", () => {
    const sales = answer({ metric: "net_sales_value", dims: ["region"], range: MONTH_TO_DATE, compare: "target" });
    const margin = answer({ metric: "gross_margin", dims: ["region"], range: MONTH_TO_DATE, compare: "prev_year" });
    if (!margin.result.ok) throw new Error(margin.result.error);
    const card = presentCard({ title: "t", query: sales.query, result: sales.result, others: [margin] });
    const strip = stripOf(card.body);
    strip.rows.forEach((row) => expect(row.second).toMatch(/^[\d.]+% · [+−-]?[\d.]+ จุด$/));
    const overall = `อัตรากำไรขั้นต้น ${margin.result.headline.value} ${formatChange("gross_margin", margin.result.headline.deltaPercent, margin.result.headline.deltaPoints ?? null)}`;
    expect(strip.overall?.second).toContain(overall);
    expect(card.footer?.details).toContain(`อัตรากำไรขั้นต้น ${margin.result.headline.compareLabel}`);
  });

  test("a change ranking names what each row moved from and to in one short line, the unit once, and the hero what the whole was, so last year's amount is on the card (AI-68)", () => {
    const card = cardOf({ metric: "ar_overdue", dims: ["region"], compare: "prev_year" }, { sort: "delta_desc" });
    const strip = stripOf(card.body);
    expect(strip.rows.length).toBeGreaterThan(1);
    strip.rows.forEach((row) => expect(row.sub).toMatch(/^[\d,.]+ → [\d,.]+ ?(ล้าน)?บาท$/));
    expect(card.hero?.detail).toMatch(/^ปีก่อน .+บาท$/);
  });

  test("one metric asked against target and against the period before is one card, the second change beside the hero and under each row (AI-66)", () => {
    const target = answer({ metric: "net_sales_value", dims: ["region"], compare: "target" });
    const previous = answer({ metric: "net_sales_value", dims: ["region"], compare: "prev_period" });
    if (!previous.result.ok) throw new Error(previous.result.error);
    expect(pairedIndexes(target, [previous])).toEqual([0]);
    const card = presentCard({ title: "t", query: target.query, result: target.result, others: [previous] });
    expect(card.hero?.detail).toContain(TH.dash.compare.prev_period);
    expect(stripOf(card.body).overall?.second).toContain(TH.dash.compare.prev_period);
    const strip = stripOf(card.body);
    expect(strip.rows.length).toBeGreaterThan(1);
    strip.rows.forEach((row) => expect(row.second).toEndWith(TH.dash.compare.prev_period));
  });
});

describe("a first bucket that holds only some of its days", () => {
  test("a weekly line starting mid-week labels the short week with its days and draws the step to it dashed, never as a collapse (AI-83)", () => {
    const body = expectKind(bodyOf({ metric: "net_sales_volume", dims: ["week"], grain: "week", range: { from: "2026-08-08", to: "2026-08-30" }, compare: "none" }), "line");
    expect(body.series[1].name).toEndWith("มีข้อมูล 2 วัน");
    expect(body.series[0].values[0]).toBeNull();
    expect(body.series[1].style).toBe("dashed");
    expect(body.series[1].values.slice(2).every((value) => value === null)).toBe(true);
  });
});

describe("a period split into days", () => {
  test("this week by day leads with the week's total against the week before, not its last day (AI-71)", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["date"], grain: "day", range: { from: "2026-08-17", to: "2026-08-23" } });
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result });
    expect(card.hero?.value).toBe(result.headline.value);
    expect(card.hero?.delta).toBe(formatChange(query.metric, result.headline.deltaPercent, result.headline.deltaPoints ?? null));
    expect(card.body.kind).toBe("line");
  });
});

describe("a rate over time", () => {
  const TWELVE_MONTHS_TO_RUNNING = { from: monthStart(DATA_AS_OF, 11), to: monthEnd(DATA_AS_OF) };

  test("the hero is the latest full month against the one before, and the running month is cut on the day the data stops", () => {
    const { query, result } = answer({ metric: "attrition_rate", dims: ["month"], range: TWELVE_MONTHS_TO_RUNNING, compare: "none" });
    const card = presentCard({ title: "t", query, result });
    const line = expectKind(card.body, "line");
    expect(line.labels).toHaveLength(11);
    expect(card.footer?.details).toContain("เดือนปัจจุบันยังไม่ครบ");
    expect(card.hero?.label).toBe(line.labels[10]);
    expect(card.hero?.detail).toBe(`เทียบ ${line.labels[9]}`);
    expect(card.hero?.delta).not.toBeNull();
    expect(card.verdict).toStartWith(line.labels[10]);
  });

  test("a sum over time leads with its latest full month against the one before, the range total as the second tile (R9, style C)", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["month"], range: SIX_MONTHS, compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result });
    const line = expectKind(card.body, "line");
    const last = result.rows[result.rows.length - 1];
    expect(card.style).toBe("scorecard");
    expect(card.hero?.label).toBe(line.labels[line.labels.length - 1]);
    expect(card.hero?.value).toBe(String(last.value_label));
    expect(card.tiles.map((tile) => [tile.label, tile.value])).toEqual([[TH.read.wholeRange, result.headline.value]]);
    expect(card.verdict).toEndWith(`จาก ${line.labels[line.labels.length - 2]}`);
  });

  test("a series of fewer than three buckets is no line: one bucket is the row it names (R1, R2)", () => {
    const { query, result } = answer({ metric: "production_output", dims: ["month"], compare: "none" });
    const card = presentCard({ title: "t", query, result });
    expect(card.body.kind).toBe("none");
    expect(card.hero?.label).toBe("ส.ค. 69");
  });

  test("a year-on-year card says why it starts later than asked", () => {
    const { query, result } = answer({ metric: "attrition_rate", dims: ["department"], range: { from: "2026-01-01", to: "2026-08-31" }, compare: "prev_year" });
    const card = presentCard({ title: "t", query, result });
    expect(card.footer?.line.startsWith("1 เม.ย. – ")).toBe(true);
    expect(card.footer?.details).toContain("เทียบปีก่อนได้ตั้งแต่");
    expect(card.hero?.delta).not.toBeNull();
  });
});

describe("the headline says what it stands for", () => {
  test("ranked by what fell, styles B and A both lead with the agent that fell most, the total on its own line (R4, AI-294)", () => {
    const picture = cardOf({ metric: "net_sales_volume", dims: ["agent"] }, { limit: 5, sort: "delta_asc" });
    const top = stripOf(picture.body);
    expect(picture.hero?.label).toBe(top.overall?.label);
    expect(top.total?.startsWith("รวมทุกเอเย่นต์")).toBe(true);
    const query = { ...queryOf({ metric: "net_sales_volume", dims: ["agent"] }), sort: "delta_asc" as const };
    const result = runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const longer = presentCard({ title: "t", query, result });
    expect(longer.style).toBe("exceptions");
    const [first] = result.rows;
    expect(longer.hero?.label).toBe(String(first.agent));
    expect(longer.hero?.value).toBe(String(first.value_label));
  });

  test("ranked by what fell when every row rose, the card still leads with the first row and its change, never the green total (R4, AI-320)", () => {
    const card = cardOf({ metric: "net_sales_value", dims: ["region"], range: MONTH_TO_DATE }, { sort: "delta_asc" });
    const strip = stripOf(card.body);
    expect(measures([strip.overall!, ...strip.rows]).every((change) => change > 0)).toBe(true);
    expect(card.hero?.label).toBe("ภาคอีสาน");
    expect(card.hero?.delta).toBe("+23.1%");
    expect(strip.overall?.label).toBe("ภาคอีสาน");
    expect(strip.overall?.text).toBe("+23.1%");
    expect(strip.total).toBe("ทั้งประเทศ +33.0% งวดก่อน 1,164.9 ล้านบาท");
  });

  test("a ranking of a rate is read around its average, the overall row on top (R5)", () => {
    const card = cardOf({ metric: "attrition_rate", dims: ["department"] }, { limit: 10, sort: "value_desc" });
    expect(card.hero?.label).toBe("เฉลี่ยทุกฝ่าย");
    const strip = stripOf(card.body);
    expect(strip.form).toBe("line");
    expect(strip.overall?.text).toBe(card.hero?.value);
  });

  test("one row of a breakdown names its row, and with a target is a scorecard of share of target, actual and what is left (R1, style C)", () => {
    const query = { ...queryOf({ metric: "net_sales_volume", dims: ["region"], range: MONTH_TO_DATE, compare: "target" }), filters: { region: ["northeast"] } };
    const result = runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result });
    const attainment = 100 + Number(result.rows[0].delta_pct);
    expect(card.style).toBe("scorecard");
    expect(card.hero?.label).toBe("ภาคอีสาน");
    expect(card.hero?.value).toBe(`${(Math.round(attainment * 10) / 10).toFixed(1)}%`);
    expect(card.tiles[0]).toMatchObject({ label: TH.read.actual, value: result.headline.value });
    expect(card.body.kind).toBe("none");
  });

  test("an average across provinces says it is an average", () => {
    const card = presentCard({ title: "t", ...answer({ metric: "market_share", dims: ["province"] }) });
    expect(card.hero?.label).toContain("เฉลี่ยทุกจังหวัด");
  });

  test("a filter the question narrowed to shows on the footer line", () => {
    const card = cardOf({ metric: "days_of_cover", dims: ["dc"] }, { filters: { sku: ["sku_purra_pet600"] } });
    expect(card.footer?.line).toContain("เพอร์ร่า");
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

describe("a change in a metric that is itself a percent", () => {
  test("is returned and drawn in points, the headline, every row and the summary alike", () => {
    const { query, result } = answer({ metric: "gross_margin", dims: ["business_unit"], compare: "prev_year" });
    if (!result.ok) throw new Error(result.error);
    const [first] = result.rows;
    expect(first.delta_pt).toBe(Math.round((Number(first.value) - Number(first.compare_value)) * 10) / 10);
    expect(typeof result.headline.deltaPoints).toBe("number");
    expect(result.summary).toContain(" จุด");
    const parts = presentCard({ title: "t", query, result });
    expect(parts.hero?.delta).toMatch(/ จุด$/);
    expect(stripOf(parts.body).overall?.change).toMatch(/ จุด$/);
  });

  test("is judged in points: half a point is a move even when it is a large relative change, and only a change that prints as 0 จุด is flat (R8)", () => {
    expect(changeToneOf("attrition_rate", 30, 0.5)).toBe("bad");
    expect(changeToneOf("market_share", -1.5, -0.9)).toBe("bad");
    expect(changeToneOf("market_share", 12, 0.04)).toBe("neutral");
    expect(changeToneOf("attrition_rate", -8, -0.1)).toBe("good");
    expect(changeToneOf("net_sales_value", 1.5, null)).toBe("neutral");
  });

  test("a ratio that is not a percent keeps its relative change", () => {
    for (const metric of ["headcount", "avg_salary"] as const) {
      const { query, result } = answer({ metric, dims: ["department"], compare: "prev_year" });
      if (!result.ok) throw new Error(result.error);
      expect(result.rows[0].delta_pt).toBeUndefined();
      expect(presentCard({ title: "t", query, result }).hero?.delta ?? "%").toMatch(/%$/);
    }
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
      provenance: { metric: "avg_salary", certified: true, sourceSystem: "HRIS", asOf: "2026-09-22", rowCount: 2, masked: ["value"], trust: "verified" },
      query: { ...query, scopeApplied: {}, labels: {} },
    };
    const ask: NextAction = { id: "ask", kind: "request_access", label: "ขอสิทธิ์จากคุณประสิทธิ์", reason: "เจ้าของเมตริก", tool: "send_email", input: {}, prompt: null };
    const parts = presentCard({ title: "t", query, result, actions: [ask] });
    expect(parts.denied?.body).toContain("ฝ่าย");
    expect(parts.denied?.body).not.toMatch(/[A-Za-z]$/);
    expect(parts.body).toEqual({ kind: "locked", rows: [], locked: [{ label: "ขาย" }, { label: "ไอที" }], askHref: null });
    expect(parts.primary).toEqual(ask);
    expect(parts.more).toEqual([]);
  });
});

describe("target in a running month", () => {
  test("says in the footer that the target is counted to the last day of data and how much of the month that is", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"], range: { from: monthStart(DATA_AS_OF), to: monthEnd(DATA_AS_OF) }, compare: "none" });
    const parts = presentCard({ title: "t", query, result });
    expect(parts.footer?.details).toContain(TH.dash.paceTarget(formatThaiDate(DATA_AS_OF), MONTH_ELAPSED));
  });

  test("a closed month needs no pace line", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"], compare: "none" });
    expect(presentCard({ title: "t", query, result }).footer?.details ?? "").not.toContain("เทียบเป้าตามเวลา");
  });
});

describe("rows too small to show", () => {
  const SMALL_PROVINCES = new Set(["ภูเก็ต", "ลำพูน", "เชียงราย"]);

  function withSmallCells(): { query: MetricQuery; result: MetricResult } {
    const { query, result } = answer({ metric: "ar_overdue", dims: ["province"], range: MONTH_TO_DATE, compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const rows = result.rows.map((row) => (SMALL_PROVINCES.has(String(row.province)) ? { ...row, value: "***", value_label: "***" } : row));
    return { query, result: { ...result, rows, provenance: { ...result.provenance, suppressedRows: rows.filter((row) => row.value === "***").length } } };
  }

  test("leave the card and are counted in the footer instead of drawn as ***", () => {
    const { query, result } = withSmallCells();
    if (!result.ok) throw new Error(result.error);
    const hidden = result.rows.filter((row) => row.value === "***").length;
    expect(hidden).toBeGreaterThan(0);
    const parts = presentCard({ title: "t", query, result });
    expect(parts.footer?.details).toContain(TH.dash.hiddenSmall(hidden, "จังหวัด", 3));
    expect(JSON.stringify(parts.body)).not.toContain("***");
    expect(parts.hero).toBeNull();
  });

  test("a single row left still shows its number", () => {
    const { query, result } = withSmallCells();
    if (!result.ok) throw new Error(result.error);
    const lone = { ...result, rows: [result.rows.find((row) => row.value !== "***"), ...result.rows.filter((row) => row.value === "***")].filter((row) => row !== undefined) };
    const body = presentCard({ title: "t", query, result: lone }).body;
    expect(body.kind).toBe("table");
  });
});

describe("a target card in a month still running", () => {
  test("its footer says the pace the target is counted to and where the month ends when the result carries a projection", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["region"], range: MONTH_TO_DATE, compare: "target" });
    if (!result.ok) throw new Error(result.error);
    const projection = { recentDays: 7, projected: "10.2 ล้านลิตร", monthTarget: "11.3 ล้านลิตร", attainment: "90.6%", attainmentToDate: "66.4%", shortBy: "3.8 ล้านลิตร", remaining: "เหลืออีก 3.8 ล้านลิตร ถึงเป้าทั้งเดือน" };
    const card = presentCard({ title: "t", query, result: { ...result, headline: { ...result.headline, projection } } });
    expect(card.footer?.details).toContain(TH.dash.paceTarget(formatThaiDate(DATA_AS_OF), MONTH_ELAPSED));
    expect(card.footer?.details).toEndWith(TH.dash.monthEnd(projection));
  });

  test("against a target the overall row is the share of target, red under the 100% line, and the bars are value over target, the furthest under first (R3)", () => {
    const { query, result } = answer({ metric: "net_sales_volume", dims: ["region"], range: MONTH_TO_DATE, compare: "target" });
    if (!result.ok) throw new Error(result.error);
    const delta = result.headline.deltaPercent ?? 0;
    const card = presentCard({ title: "t", query, result });
    expect(card.hero?.value).toBe(`${(Math.round((100 + delta) * 10) / 10).toFixed(1)}%`);
    expect(card.hero?.unit).toBe(TH.read.ofPacedTarget);
    expect(card.hero?.tone).toBe(delta < 0 ? "bad" : "neutral");
    const strip = stripOf(card.body);
    expect(strip.overall?.measure).toBeCloseTo(100 + delta, 5);
    const values = measures(strip.rows);
    expect(values).toEqual([...values].sort((left, right) => left - right));
    strip.rows.forEach((row) => expect(row.tone).toBe((row.measure ?? 100) < 100 ? "bad" : "neutral"));
  });
});

describe("a target breakdown led by the whole month", () => {
  test("puts every row on the hero's base, the share of the whole month's target, with the pace line drawn where the month should be by now and only rows behind it red (AI-141)", () => {
    const query = { ...queryOf({ metric: "net_sales_value", dims: ["agent"], range: MONTH_TO_DATE, compare: "target" }), filters: { region: ["northeast"] } };
    const result = runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const elapsed = (daysBetween(monthStart(DATA_AS_OF), DATA_AS_OF) + 1) / (daysBetween(monthStart(DATA_AS_OF), monthEnd(DATA_AS_OF)) + 1);
    const paced = 100 + (result.headline.deltaPercent ?? 0);
    const toDate = Math.round(paced * elapsed * 10) / 10;
    const projection = { recentDays: 7, projected: "371.9 ล้านบาท", monthTarget: "424.8 ล้านบาท", attainment: "87.5%", attainmentToDate: `${toDate}%`, shortBy: "96.4 ล้านบาท", remaining: "เหลืออีก 96.4 ล้านบาท ถึงเป้าทั้งเดือน" };
    const card = presentCard({ title: "t", query, result: { ...result, headline: { ...result.headline, projection } } });
    expect(card.hero).toMatchObject({ value: `${toDate}%`, unit: TH.read.ofMonthTarget });
    const strip = stripOf(card.body);
    expect(strip.baseline).toBeCloseTo(100 * elapsed, 5);
    expect(strip.overall?.measure).toBeCloseTo(toDate, 5);
    expect(strip.overall?.sub ?? "").not.toContain(`${Math.round(paced * 10) / 10}%`);
    const byLabel = new Map(result.rows.map((row) => [String(row.agent), 100 + Number(row.delta_pct)]));
    expect(strip.rows.length).toBe(result.rows.length);
    strip.rows.forEach((row) => {
      const rowPaced = byLabel.get(row.label) ?? 0;
      expect(row.measure).toBeCloseTo(rowPaced * elapsed, 5);
      expect(row.tone).toBe(rowPaced < 100 ? "bad" : "neutral");
      if (row.valued) expect(row.text).toBe(`${Math.round(rowPaced * elapsed * 10) / 10}%`);
    });
  });
});

describe("a target breakdown ranked by its gap", () => {
  test("is read against the 100% line with its base named, never in change words like ยอดหาย, by one group or two (AI-103)", () => {
    for (const dims of [["agent"], ["agent", "province"]] as Dim[][]) {
      const card = cardOf({ metric: "net_sales_value", dims, range: MONTH_TO_DATE, compare: "target" }, { sort: "delta_asc", filters: { region: ["northeast"] } });
      const strip = card.body.kind === "strip" ? card.body.strip : card.body.kind === "exceptions" ? card.body.strip : null;
      expect(strip?.baseline).toBe(100);
      expect(card.verdict ?? "").not.toContain(TH.read.lost);
      expect(card.hero?.unit).toBe(TH.read.ofPacedTarget);
      expect(card.hero?.value).toMatch(/^\d+(\.\d)?%$/);
    }
  });
});

describe("two months of one province against target", () => {
  test("reads each month against its target, September first with its value and target, never the two summed or the province ranked against itself (AI-106)", () => {
    const REP = accessFor(findUser("u_krit")!);
    const query: MetricQuery = { metric: "net_sales_volume", dims: ["month", "province"], filters: { province: ["pv_khonkaen"] }, range: { from: "2026-09-01", to: "2026-10-31" }, grain: "month", compare: "target", limit: 10 };
    const result = runMetric(query, REP);
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result });
    expect(card.verdict ?? "").not.toContain("ใหญ่สุดทั้งช่วง");
    expect(card.hero?.value).not.toBe(result.headline.value);
    expect(card.hero?.unit).toBe(TH.read.ofTarget);
    const strip = stripOf(card.body);
    expect(strip.baseline).toBe(100);
    expect(strip.rows.map((row) => row.label)).toEqual(["ก.ย. 69", "ต.ค. 69"]);
    expect(strip.rows.every((row) => row.valued)).toBe(true);
    expect(strip.overall).toBeNull();
    expect(metricTitle(result, query)).not.toContain(TH.dash.dimUnit.province);
    const september = result.rows.find((row) => row.month === "2026-09");
    const [value, unit] = String(september?.value_label).split(" ");
    expect(strip.rows[0].sub).toBe(`${value} · เป้า ${formatMetricValue("net_sales_volume", Number(september?.compare_value))}`);
    expect(strip.rows[0].sub).toEndWith(` ${unit}`);
  });
});

describe("a total asked beside its own breakdown", () => {
  test("is one card: the breakdown, its overall row the total, never a second card repeating it (AI-122)", () => {
    const filters = { region: ["northeast"] };
    const total = { ...queryOf({ metric: "ar_overdue", dims: ["region"], range: MONTH_TO_DATE, compare: "none" }), filters };
    const byAgent = { ...queryOf({ metric: "ar_overdue", dims: ["agent"], range: MONTH_TO_DATE, compare: "none" }), filters, sort: "value_desc" as const, limit: 20 };
    const sources = [total, byAgent].map((query) => ({ query, result: runMetric(query, CEO) }));
    expect(pairedIndexes(sources[0], [sources[1]])).toEqual([0]);
    expect(pairedIndexes(sources[1], [sources[0]])).toEqual([0]);
    const card = presentCard({ title: "t", query: total, result: sources[0].result, others: [sources[1]] });
    const strip = card.body.kind === "exceptions" ? card.body.strip : stripOf(card.body);
    expect(card.body.kind === "exceptions" ? (card.body.fold?.rows.length ?? 0) + strip.rows.length : strip.rows.length).toBeGreaterThan(1);
    expect(card.title).toContain(TH.dash.dimUnit.agent);
    const agents = sources[1].result;
    if (!agents.ok) throw new Error(agents.error);
    const named = String(agents.rows[3].agent);
    const asked = presentCard({ title: "t", query: total, result: sources[0].result, others: [{ query: byAgent, result: { ...agents, headline: { ...agents.headline, asked: [named] } } }] });
    expect(asked.verdict).toStartWith(named);
  });
});

describe("a breakdown with changes", () => {
  test("names what its changes are against on the overall row, so a reply cannot swap last period for last year unseen (AI-104)", () => {
    for (const compare of ["prev_period", "prev_year"] as const) {
      const { query, result } = answer({ metric: "ar_overdue", dims: ["region"], range: MONTH_TO_DATE, compare });
      if (!result.ok) throw new Error(result.error);
      const strip = stripOf(presentCard({ title: "t", query, result }).body);
      expect(strip.overall?.sub ?? "").toContain(String(result.headline.compareLabel));
    }
  });
});

describe("one scope against a comparison", () => {
  test("labels the tile of the value compared with by its window: the same month last year, or the month before, never งวดก่อน (AI-114, AI-223)", () => {
    const tiles = (compare: MetricQuery["compare"]) => cardOf({ metric: "net_sales_value", dims: ["region"], range: MONTH_TO_DATE, compare }, { filters: { region: ["northeast"] } }).tiles.map((tile) => tile.label);
    expect(tiles("prev_year")).toContain("พ.ย. 68");
    expect(tiles("prev_period")).toContain("ต.ค. 69");
    expect([...tiles("prev_year"), ...tiles("prev_period")]).not.toContain(TH.read.previous);
  });
});

describe("a list cut by a limit", () => {
  test("speaks for the rows it shows, never for every group: the ten SKUs that fell most are named as ten (AI-105)", () => {
    const sku: Dim[] = ["sku"];
    const asks = [
      { ask: { metric: "net_sales_volume" as const, dims: sku, range: MONTH_TO_DATE, compare: "target" as const }, filters: { agent: ["ag_nea_02"] } },
      { ask: { metric: "net_sales_volume" as const, dims: sku, range: MONTH_TO_DATE, compare: "prev_period" as const }, filters: { agent: ["ag_nea_02"] } },
      { ask: { metric: "net_sales_volume" as const, dims: sku, range: MONTH_TO_DATE, compare: "prev_year" as const }, filters: {} },
    ];
    for (const { ask, filters } of asks) {
      const card = cardOf(ask, { sort: "delta_asc", limit: 10, filters });
      expect(card.verdict ?? "").not.toContain("ทุก");
    }
    const changes = cardOf(asks[1].ask, { sort: "delta_asc", limit: 10, filters: asks[1].filters });
    if (/ใกล้กัน|SKU ที่/.test(changes.verdict ?? "")) expect(changes.verdict).toContain(TH.read.topMovers(10, "SKU", TH.read.fell));
  });
});

describe("a breakdown whose level decides", () => {
  test("cover counts the groups under the low-cover line over every group before the row cap, and names the worst", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc"], compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const every = result.rows.map((row) => Number(row.value));
    const top = { ...query, limit: 2 };
    const capped = runMetric(top, CEO);
    if (!capped.ok) throw new Error(capped.error);
    expect(capped.rows).toHaveLength(2);
    expect(capped.headline.underLine).toEqual({ line: LOW_COVER_DAYS, count: every.filter((days) => days < LOW_COVER_DAYS).length, of: every.length });
    const card = presentCard({ title: "t", query: top, result: capped });
    const under = capped.headline.underLine;
    const worst = weakestRow(top, capped);
    if (under && under.count > 1) expect(card.verdict).toStartWith(`${under.count} DC`);
    if (under && under.count === 0) expect(card.verdict).toStartWith(`${worst?.label} เหลือน้อยสุด ${worst?.value}`);
  });

  test("cover ranked highest first is an overstock question: the hero is the row furthest over the line, never the weakest (AI-67)", () => {
    const card = cardOf({ metric: "days_of_cover", dims: ["brand"], compare: "none" }, { sort: "value_desc", limit: 5 });
    const values = stripOf(card.body).rows.map((row) => row.measure ?? 0);
    expect(values).toEqual([...values].sort((left, right) => right - left));
    expect(card.hero?.label).toStartWith(TH.dash.highest);
    expect(card.hero?.value).toBe(stripOf(card.body).rows[0].text);
    expect(card.verdict).toContain("นานสุด");
  });

  test("asked only for the rows under the line, the count still reads against every group", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc", "sku"], compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const below = runMetric({ ...query, where: { op: "below", value: LOW_COVER_DAYS } }, CEO);
    if (!below.ok) throw new Error(below.error);
    expect(below.headline.underLine).toEqual(result.headline.underLine ?? null);
    expect(below.headline.underLine?.of).toBeGreaterThan(below.headline.underLine?.count ?? 0);
  });

  test("asked for the groups under a threshold of its own, the card counts and names that threshold, agreeing with the rows it draws (R7)", () => {
    const query: MetricQuery = { metric: "target_attainment", dims: ["agent"], filters: { region: ["northeast"] }, range: MONTH_TO_DATE, grain: "month", compare: "none", limit: null, where: { op: "below", value: 90 } };
    const result = runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result });
    const rows = stripOf(card.body).rows;
    const of = result.headline.underLine?.of ?? 0;
    expect(result.headline.underLine?.count).not.toBe(rows.length);
    rows.forEach((row) => expect(row.measure ?? Infinity).toBeLessThan(90));
    expect(card.verdict).toBe(spaced(TH.read.countOf(rows.length, of, "เอเย่นต์", TH.read.underShareOfTarget("90.0%"))));
    expect(card.hero?.value).toBe(TH.dash.countOf(rows.length, of, "เอเย่นต์"));
  });

  test("attainment by region says which regions are under target, the overall level on top", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"] });
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result });
    const under = result.rows.filter((row) => Number(row.value) < 100);
    expect(card.hero?.value).toBe(result.headline.value);
    if (under.length === 0) expect(card.verdict).toBe(TH.read.target.none("ภาค", TH.read.goal));
    else expect(card.verdict).toContain(String(under.sort((left, right) => Number(left.value) - Number(right.value))[0].region));
  });

  test("a trend of cover over time keeps its level headline, there is nothing to count", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["week"], grain: "week", range: SIX_MONTHS });
    if (!result.ok) throw new Error(result.error);
    expect(result.headline.underLine ?? null).toBeNull();
    expect(presentCard({ title: "t", query, result }).hero?.label).not.toBe(TH.dash.underCover(LOW_COVER_DAYS));
  });
});

describe("scorecards and one-row cards keep to the card rules (AI-156)", () => {
  const PROJECTION = { recentDays: 7, projected: "371.9 ล้านบาท", monthTarget: "424.8 ล้านบาท", attainment: "87.5%", attainmentToDate: "77.3%", shortBy: "96.4 ล้านบาท", remaining: "เหลืออีก 96.4 ล้านบาท ถึงเป้าทั้งเดือน" };

  test("a month-to-date scorecard has two tiles beside its hero, all on the whole month's base, and its verdict says where the month ends without a number from another base", () => {
    const query = { ...queryOf({ metric: "net_sales_value", dims: ["region"], range: MONTH_TO_DATE, compare: "target" }), filters: { region: ["northeast"] } };
    const result = runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result: { ...result, headline: { ...result.headline, projection: PROJECTION } } });
    expect(card.style).toBe("scorecard");
    expect(card.hero).toMatchObject({ label: "ภาคอีสาน", value: "77.3%", unit: TH.read.ofMonthTarget });
    expect(card.tiles.map((tile) => tile.label)).toEqual([TH.read.leftToDate, TH.read.monthEnd]);
    const paced = Math.round((100 + (result.headline.deltaPercent ?? 0)) * 10) / 10;
    expect(card.verdict).toBe(paced < 100 ? "ภาคอีสานช้ากว่าเป้าตามเวลา คาดปิดเดือนไม่ถึงเป้า" : "ภาคอีสานทันเป้าตามเวลา แต่คาดปิดเดือนไม่ถึงเป้า");
  });

  test("one row with nothing to judge it by never repeats its hero as the headline", () => {
    const card = cardOf({ metric: "net_sales_value", dims: ["region"], range: MONTH_TO_DATE, compare: "none" }, { filters: { region: ["northeast"] } });
    expect(card.hero?.label).toBe("ภาคอีสาน");
    expect(card.verdict ?? "").not.toContain(card.hero?.value ?? "-");
  });

  test("one row of cover is judged against the low-cover line, not restated", () => {
    const card = cardOf({ metric: "days_of_cover", dims: ["dc"], range: MONTH_TO_DATE, compare: "none" }, { filters: { dc: ["dc_khonkaen"] } });
    expect(card.verdict).toMatch(new RegExp(`(เกิน|ไม่ถึง) ${LOW_COVER_DAYS} วัน$`));
    expect(card.verdict ?? "").not.toContain(card.hero?.value ?? "-");
  });

  test("a breakdown whose question named one group leads with that group on top, the overall level beside it, never the all-group average as the hero", () => {
    const { query, result } = answer({ metric: "gross_margin", dims: ["business_unit"] });
    if (!result.ok) throw new Error(result.error);
    const named = String(result.rows[1].business_unit);
    const card = presentCard({ title: "t", query, result: { ...result, headline: { ...result.headline, asked: [named] } } });
    expect(card.hero?.label).toBe(named);
    const strip = stripOf(card.body);
    expect(strip.overall?.label).toBe(named);
    expect(strip.total).toContain(result.headline.value);
    expect(strip.overall?.sub ?? "").not.toContain(result.headline.value);
    expect(strip.rows.map((row) => row.label)).not.toContain(named);
  });

  test("a named group with nothing to compare is judged against the others, never restated: a rate against the average, a sum as its share of the whole", () => {
    const margin = answer({ metric: "gross_margin", dims: ["business_unit"], compare: "none" });
    if (!margin.result.ok) throw new Error(margin.result.error);
    const named = String(margin.result.rows[1].business_unit);
    const rate = presentCard({ title: "t", query: margin.query, result: { ...margin.result, headline: { ...margin.result.headline, asked: [named] } } });
    expect(rate.verdict).toMatch(new RegExp(`^${named}(สูง|ต่ำ)กว่า${TH.read.averageOf(TH.dash.dimUnit.business_unit)} [\\d.]+ จุด$`));
    const sales = answer({ metric: "net_sales_value", dims: ["region"], compare: "none" });
    if (!sales.result.ok) throw new Error(sales.result.error);
    const region = String(sales.result.rows[2].region);
    const sum = presentCard({ title: "t", query: sales.query, result: { ...sales.result, headline: { ...sales.result.headline, asked: [region] } } });
    expect(sum.verdict).toMatch(new RegExp(`^${region}คิดเป็น [\\d.]+% ของทั้งหมด$`));
  });

  test("a one-row card's subject names its row, so a pinned tile says which region it is", () => {
    const query = { ...queryOf({ metric: "net_sales_value", dims: ["region"], range: MONTH_TO_DATE, compare: "target" }), filters: { region: ["northeast"] } };
    expect(subjectOf(query, runMetric(query, CEO))).toBe(TH.dash.ownScope(metricLabel("net_sales_value"), "ภาคอีสาน"));
  });
});

describe("a gap card (explain_gap)", () => {
  const NORTHEAST_BY_BRAND: GapAnswer = {
    period_label: "1 พ.ย. 2569 – 26 พ.ย. 2569",
    actual_label: "328.4 ล้านบาท",
    compare_label: "เป้า 368.2 ล้านบาท",
    gap_label: "−39.8 ล้านบาท",
    attainment_label: "89.2%",
    contributors: [
      { label: "ลีโอ", gap_label: "−25.1 ล้านบาท", share_label: "63.1%" },
      { label: "สิงห์", gap_label: "−14.9 ล้านบาท", share_label: "37.6%" },
      { label: "โซดาสิงห์", gap_label: "−123,727 บาท", share_label: "0.3%" },
    ],
    rest: null,
    offsetting: [
      { label: "น้ำดื่มสิงห์", gap_label: "+165,120 บาท" },
      { label: "เพอร์ร่า", gap_label: "+98,834 บาท" },
    ],
    share_note: null,
    projection: { basis: "วันที่เหลือของเดือนขายเท่าค่าเฉลี่ย 7 วันล่าสุด และเป้ากระจายเท่ากันทุกวัน", projected_label: "371.9 ล้านบาท", month_target_label: "424.8 ล้านบาท", attainment_label: "87.5%" },
  };

  test("in a month still running leads with where the month ends and a verdict built from the result, the gap's base named above its parts, never a double minus (AI-142)", () => {
    const card = presentGap({ answer: NORTHEAST_BY_BRAND, metric: "net_sales_value", split: "brand" });
    expect(card.hero).toMatchObject({ label: TH.cards.gap.monthEndLabel, value: "87.5%", unit: TH.read.ofMonthTarget, tone: "bad" });
    expect(card.verdict).toBe("คาดปิดเดือนไม่ถึงเป้า ถึงวันนี้ลีโอฉุดมากสุด 25.1 ล้านบาท");
    const body = expectKind(card.body, "exceptions");
    expect(body.strip.rows[0]).toMatchObject({ label: `${TH.cards.gap.toDate}ต่ำกว่าเป้าตามเวลา`, text: "39.8 ล้านบาท" });
    expect(body.strip.rows.slice(1).map((row) => row.label)).toEqual(["ลีโอ", "สิงห์", "โซดาสิงห์"]);
    expect(body.fold?.rows.map((row) => row.label)).toEqual(["น้ำดื่มสิงห์", "เพอร์ร่า"]);
    expect(body.fold?.line).toBe(TH.cards.gap.offsetFold(2));
    expect(`${card.title} ${card.verdict} ${body.strip.rows.map((row) => row.text).join(" ")}`).not.toMatch(/[−-]/);
    expect(card.title).toBe(TH.dash.ownScope(metricLabel("net_sales_value"), TH.dash.byDims([TH.dash.dimUnit.brand])));
  });

  test("asked which region worries most, the verdict names the region that pulled furthest", () => {
    const answer: GapAnswer = { ...NORTHEAST_BY_BRAND, contributors: [{ label: "ภาคอีสาน", gap_label: "−39.8 ล้านบาท", share_label: "78.1%" }, { label: "ภาคเหนือ", gap_label: "−3.1 ล้านบาท", share_label: "6.1%" }], offsetting: [] };
    expect(presentGap({ answer, metric: "net_sales_value", split: "region" }).verdict).toContain("ภาคอีสานฉุดมากสุด 39.8 ล้านบาท");
  });

  test("a gap spread wide names no part in its verdict, as explain_gap's share_note says (AI-145)", () => {
    const answer: GapAnswer = { ...NORTHEAST_BY_BRAND, projection: null, attainment_label: null, compare_label: "สัปดาห์ก่อน 82.0 ล้านบาท", contributors: [{ label: "อีสานรุ่งโรจน์ ค้าส่ง", gap_label: "−540,000 บาท", share_label: "6.3%" }, { label: "อุบลศรีสุข เทรดดิ้ง", gap_label: "−420,000 บาท", share_label: "4.9%" }], rest: { label: "", gap_label: "−6.4 ล้านบาท", share_label: "74.3%" }, offsetting: [] };
    const verdict = presentGap({ answer, metric: "net_sales_value", split: "agent" }).verdict;
    expect(verdict).not.toContain("มากสุด");
    expect(verdict).toContain(TH.cards.gap.spread);
  });

  test("a closed month against target leads with its share of target; against last year with the actual and its coloured change", () => {
    const closed = presentGap({ answer: { ...NORTHEAST_BY_BRAND, projection: null }, metric: "net_sales_value", split: "brand" });
    expect(closed.hero).toMatchObject({ value: "89.2%", unit: TH.read.ofTarget, tone: "bad" });
    expect(closed.verdict).toBe("ต่ำกว่าเป้า 39.8 ล้านบาท ลีโอฉุดมากสุด 25.1 ล้านบาท");
    const lastYear = presentGap({ answer: { ...NORTHEAST_BY_BRAND, projection: null, attainment_label: null, compare_label: "ปีก่อน 368.2 ล้านบาท" }, metric: "net_sales_value", split: "brand" });
    expect(lastYear.hero).toMatchObject({ value: "328.4 ล้านบาท", delta: "−39.8 ล้านบาท", tone: "bad" });
    expect(lastYear.verdict).toBe("ต่ำกว่าปีก่อน 39.8 ล้านบาท ลีโอฉุดมากสุด 25.1 ล้านบาท");
  });
});

describe("a change ranking's verdict", () => {
  test("counts every row that meets its own words: three agents more than doubled, so the card says 3 and draws all three thick (AI-144)", () => {
    const query: MetricQuery = { metric: "ar_overdue", dims: ["agent"], filters: { region: ["south"] }, range: { from: "2026-10-01", to: "2026-10-31" }, grain: "month", compare: "prev_period", limit: 10, sort: "delta_desc" };
    const result = runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const doubled = result.rows.filter((row) => Number(row.delta_pct) >= 100);
    expect(doubled.length).toBeGreaterThanOrEqual(3);
    const card = presentCard({ title: "t", query, result });
    expect(card.verdict).toBe(`${doubled.length} เอเย่นต์${TH.read.gained}${TH.read.overDouble}`);
    const strip = stripOf(card.body);
    expect([strip.overall, ...strip.rows].filter((row) => row?.exception).map((row) => row?.label)).toEqual(doubled.map((row) => String(row.agent)));
  });
});

describe("two series overlaid", () => {
  const overlayOf = (from: string, limit: number | null = null) => {
    const range = { from, to: DATA_AS_OF };
    const sellIn: MetricQuery = { metric: "net_sales_volume", dims: ["week"], filters: {}, range, grain: "week", compare: "none", limit };
    const sellOut: MetricQuery = { ...sellIn, metric: "sell_out_volume" };
    const first = { query: sellIn, result: runMetric(sellIn, CEO) };
    const second = { query: sellOut, result: runMetric(sellOut, CEO) };
    if (!first.result.ok) throw new Error(first.result.error);
    const card = presentCard({ title: "t", query: sellIn, result: first.result, others: [second] });
    return { card, rows: first.result.rows.length };
  };
  const weekStartOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
  const midWeek = addDays(weekStartOf(addDays(DATA_AS_OF, -83)), 3);

  test("drop the running week like one trend does and say so, so neither line falls off a cliff at its end", () => {
    const { card, rows } = overlayOf(weekStartOf(addDays(DATA_AS_OF, -83)));
    const body = expectKind(card.body, "line");
    expect(body.series.length).toBeGreaterThanOrEqual(2);
    expect(body.labels).not.toContain(periodLabelTh(weekKeyOfIso(DATA_AS_OF)));
    expect(body.labels).toHaveLength(rows - 1);
    expect(JSON.stringify(card.footer)).toContain(TH.dash.partialWeek);
    expect(JSON.stringify(card.footer)).not.toContain(TH.dash.partialFirstWeek(4));
  });

  test("drop a short first week too and say how many days it held, so neither line starts with a fake jump", () => {
    const { card, rows } = overlayOf(midWeek);
    const body = expectKind(card.body, "line");
    expect(body.labels).not.toContain(periodLabelTh(weekKeyOfIso(midWeek)));
    expect(body.labels).toHaveLength(rows - 2);
    body.series.forEach((series) => expect(series.style).not.toBe("dashed"));
    expect(JSON.stringify(card.footer)).toContain(TH.dash.partialFirstWeek(4));
  });

  test("count in the hero and tiles only the weeks the chart draws, and name those weeks in the footer when limit cut the first week off the range (AI-331)", () => {
    const { card } = overlayOf("2026-09-01", 12);
    const body = expectKind(card.body, "line");
    const totalOf = (index: number) => body.series[index].values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    expect(card.tiles.map((tile) => tile.value)).toEqual([formatMetricValue("net_sales_volume", totalOf(0)), formatMetricValue("sell_out_volume", totalOf(1))]);
    expect(card.hero?.value).toBe(`${((totalOf(1) / totalOf(0)) * 100).toFixed(1)}%`);
    expect(card.footer?.details).toContain(TH.dash.drawnSpan(body.labels[0], body.labels[body.labels.length - 1]));
  });
});
