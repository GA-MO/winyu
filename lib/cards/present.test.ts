import { describe, expect, test } from "bun:test";
import type { Dim, Grain, MetricId, MetricQuery, MetricResult, NextAction } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { DATA_AS_OF, daysBetween, formatThaiDate, monthEnd, monthStart } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { TH } from "@/lib/i18n/th";
import { LOW_COVER_DAYS } from "@/lib/semantic/metrics";
import { changeToneOf } from "@/lib/dashboard/metric-display";
import { pairedIndexes, presentCard, presentForecast, weakestRow, type CardBody, type CardParts, type CardView, type ForecastAnswer, type SortBy } from "./present";
import type { ReadRow, Strip } from "./reading";

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
    expect(cells.every((cell) => /%$/.test(cell.text) && cell.detail !== null)).toBe(true);
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
    expect(strip.overall?.label).toBe("รวมทุกเอเย่นต์");
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
    expect(body.points.filter((point) => point.named).length).toBe(3);
    expect(card.verdict).not.toMatch(/r = |\d\.\d\d/);
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
    expect(card.verdict).toMatch(/เอเย่นต์/);
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
    expect(card.footer?.details).toContain("ดัชนี");
  });

  test("results that do not fit together fall back to the first card", () => {
    expect(bodyOf({ metric: "net_sales_volume", dims: ["region"] }, { others: [{ metric: "headcount", dims: ["department"] }] }).kind).toBe("strip");
  });

  test("a change ranking names what each row moved from, and the hero what the whole was, so last year's amount is on the card (AI-68)", () => {
    const card = cardOf({ metric: "ar_overdue", dims: ["region"], compare: "prev_year" }, { sort: "delta_desc" });
    const strip = stripOf(card.body);
    strip.rows.forEach((row) => expect(row.sub).toMatch(/ · ปีก่อน .+บาท$/));
    expect(card.hero?.detail).toMatch(/^ปีก่อน .+บาท$/);
  });

  test("one metric asked against target and against the period before is one card, the second change beside the hero and under each row (AI-66)", () => {
    const target = answer({ metric: "net_sales_value", dims: ["region"], compare: "target" });
    const previous = answer({ metric: "net_sales_value", dims: ["region"], compare: "prev_period" });
    if (!previous.result.ok) throw new Error(previous.result.error);
    expect(pairedIndexes(target, [previous])).toEqual([0]);
    const card = presentCard({ title: "t", query: target.query, result: target.result, others: [previous] });
    expect(card.hero?.detail).toContain(`${TH.dash.compare.prev_period} `);
    const strip = stripOf(card.body);
    expect(strip.rows.length).toBeGreaterThan(1);
    strip.rows.forEach((row) => expect(row.sub).toStartWith(TH.dash.compare.prev_period));
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
  test("ranked by what fell, style B leads with every agent's change and style A with the agent that fell most (R4)", () => {
    const picture = cardOf({ metric: "net_sales_volume", dims: ["agent"] }, { limit: 5, sort: "delta_asc" });
    expect(picture.hero?.label).toBe("รวมทุกเอเย่นต์");
    const query = { ...queryOf({ metric: "net_sales_volume", dims: ["agent"] }), sort: "delta_asc" as const };
    const result = runMetric(query, CEO);
    if (!result.ok) throw new Error(result.error);
    const longer = presentCard({ title: "t", query, result });
    expect(longer.style).toBe("exceptions");
    const [first] = result.rows;
    if (longer.hero?.label !== "รวมทุกเอเย่นต์") {
      expect(longer.hero?.label).toBe(String(first.agent));
      expect(longer.hero?.value).toBe(String(first.value_label));
      expect(longer.hero?.tone).toBe("bad");
    }
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
    expect(card.hero?.value).toBe(`${Math.round(attainment * 10) / 10}%`);
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
    expect(card.hero?.value).toBe(`${Math.round((100 + delta) * 10) / 10}%`);
    expect(card.hero?.unit).toBe(TH.read.ofPacedTarget);
    expect(card.hero?.tone).toBe(delta < 0 ? "bad" : "neutral");
    const strip = stripOf(card.body);
    expect(strip.overall?.measure).toBeCloseTo(100 + delta, 5);
    const values = measures(strip.rows);
    expect(values).toEqual([...values].sort((left, right) => left - right));
    strip.rows.forEach((row) => expect(row.tone).toBe((row.measure ?? 100) < 100 ? "bad" : "neutral"));
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

  test("asked only for the rows under the line, the count still reads against every group", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["dc", "sku"], compare: "none" });
    if (!result.ok) throw new Error(result.error);
    const below = runMetric({ ...query, where: { op: "below", value: LOW_COVER_DAYS } }, CEO);
    if (!below.ok) throw new Error(below.error);
    expect(below.headline.underLine).toEqual(result.headline.underLine ?? null);
    expect(below.headline.underLine?.of).toBeGreaterThan(below.headline.underLine?.count ?? 0);
  });

  test("attainment by region says which regions are under target, the overall level on top", () => {
    const { query, result } = answer({ metric: "target_attainment", dims: ["region"] });
    if (!result.ok) throw new Error(result.error);
    const card = presentCard({ title: "t", query, result });
    const under = result.rows.filter((row) => Number(row.value) < 100);
    expect(card.hero?.value).toBe(result.headline.value);
    if (under.length === 0) expect(card.verdict).toBe(TH.read.target.none("ภาค"));
    else expect(card.verdict).toContain(String(under.sort((left, right) => Number(left.value) - Number(right.value))[0].region));
  });

  test("a trend of cover over time keeps its level headline, there is nothing to count", () => {
    const { query, result } = answer({ metric: "days_of_cover", dims: ["week"], grain: "week", range: SIX_MONTHS });
    if (!result.ok) throw new Error(result.error);
    expect(result.headline.underLine ?? null).toBeNull();
    expect(presentCard({ title: "t", query, result }).hero?.label).not.toBe(TH.dash.underCover(LOW_COVER_DAYS));
  });
});
