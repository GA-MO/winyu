import type { z } from "zod";
import { explainGapInputSchema, type MetricQuery, type MetricResult, type MetricRow } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { formatForSummary } from "@/lib/semantic/engine";
import { metricDef } from "@/lib/semantic/metrics";
import { MONTH_OF_DAY, TODAY, addDays, daysInMonthIndex, toDayIndex } from "@/lib/data/dates";
import { breakDownGap, formatShare, projectMonthEnd, type Contribution, type GapPart } from "@/lib/engine/gap";
import { runMetric } from "@/lib/server/metrics";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const RECENT_DAYS = 7;
const OTHERS = "ที่เหลือรวมกัน";
const NOT_ADDITIVE = "แยกช่องว่างได้เฉพาะเมตริกที่รวมยอดได้ (ปริมาณ มูลค่า ยอดค้าง) ถ้าเป็นสัดส่วนหรือ % ให้ใช้เมตริกยอดที่อยู่เบื้องหลังแทน";
const COMPARE_LABELS = { target: "เป้า", prev_period: "ช่วงก่อนหน้า", prev_year: "ปีก่อน" } as const;

type Input = z.infer<typeof explainGapInputSchema>;

function amountOf(input: Input, value: number): string {
  const def = metricDef(input.metric);
  return def ? formatForSummary(def, value) : String(value);
}

function queryOf(input: Input, dims: MetricQuery["dims"], range = input.range, compare: MetricQuery["compare"] = input.compare): MetricQuery {
  return { metric: input.metric, dims, filters: input.filters, range, grain: "day", compare, limit: null, sort: null };
}

function partOf(row: MetricRow, label: string): GapPart {
  return { label, value: Number(row.value ?? 0), compare: Number(row.compare_value ?? 0) };
}

function signed(input: Input, amount: number): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${amountOf(input, Math.abs(Math.round(amount)))}`;
}

function contributionRow(input: Input, contribution: Contribution) {
  return { label: contribution.label, gap_label: signed(input, contribution.gap), share_label: formatShare(contribution.share) };
}

function offsettingRow(input: Input, contribution: Contribution) {
  return { label: contribution.label, gap_label: signed(input, contribution.gap) };
}

async function projectionOf(input: Input, total: GapPart) {
  const monthStart = addDays(TODAY, 1 - Number(TODAY.slice(8, 10)));
  if (input.compare !== "target" || input.range.to !== TODAY || input.range.from !== monthStart) return null;
  const recent = await runMetric(queryOf(input, [], { from: addDays(TODAY, 1 - RECENT_DAYS), to: TODAY }, "none"), currentAccess());
  if (!recent.ok || recent.rows.length === 0) return null;
  const projection = projectMonthEnd({
    actual: total.value,
    targetSoFar: total.compare,
    elapsedDays: toDayIndex(TODAY) - toDayIndex(monthStart) + 1,
    monthDays: daysInMonthIndex(MONTH_OF_DAY[toDayIndex(TODAY)]),
    recentDailyAverage: Number(recent.rows[0].value ?? 0) / RECENT_DAYS,
  });
  if (!projection) return null;
  return {
    label: `สิ้นเดือน ถ้าขายเท่า ${RECENT_DAYS} วันล่าสุด`,
    basis: `วันที่เหลือของเดือนขายเท่าค่าเฉลี่ย ${RECENT_DAYS} วันล่าสุด และเป้ากระจายเท่ากันทุกวัน`,
    projected_label: amountOf(input, Math.round(projection.projected)),
    month_target_label: amountOf(input, Math.round(projection.monthTarget)),
    attainment_label: `${projection.attainment.toFixed(1)}%`,
  };
}

function isFailure(result: MetricResult): result is Extract<MetricResult, { ok: false }> {
  return !result.ok;
}

export const explainGapTool = defineTool({
  name: "explain_gap",
  connector: "cop",
  tier: "read",
  roles: "all",
  description:
    "Split the gap between actual and target (or a prior period) of an additive metric by one dimension: each part's own gap and its share of the whole gap, computed by Cop, plus the parts pulling the other way. With compare=target over month-to-date it also projects where the month ends at the recent pace. Call it before saying who or what caused a shortfall; copy share_label as is, never compute a share yourself.",
  input: explainGapInputSchema,
  execute: async (input: Input) => {
    const access = currentAccess();
    const [total, split] = await Promise.all([runMetric(queryOf(input, []), access), runMetric(queryOf(input, [input.split]), access)]);
    if (isFailure(total)) return total;
    if (isFailure(split)) return split;
    if (total.headline.aggregate !== "sum") return { ok: false as const, error: NOT_ADDITIVE, code: "BAD_QUERY" as const };
    const whole = partOf(total.rows[0] ?? {}, metricLabel(input.metric));
    const breakdown = breakDownGap(whole, split.rows.map((row) => partOf(row, String(row[input.split] ?? ""))));
    const versus = COMPARE_LABELS[input.compare];
    return {
      ok: true as const,
      summary: `${metricLabel(input.metric)} ${total.headline.periodLabel}: จริง ${amountOf(input, whole.value)} · ${versus} ${amountOf(input, whole.compare)} · ช่องว่าง ${signed(input, breakdown.gap)}`,
      period_label: total.headline.periodLabel,
      actual_label: amountOf(input, whole.value),
      compare_label: `${versus} ${amountOf(input, whole.compare)}`,
      gap_label: signed(input, breakdown.gap),
      attainment_label: input.compare === "target" && whole.compare > 0 ? `${((whole.value / whole.compare) * 100).toFixed(1)}%` : null,
      contributors: breakdown.contributors.map((contribution) => contributionRow(input, contribution)),
      rest: breakdown.rest ? contributionRow(input, { ...breakdown.rest, label: OTHERS }) : null,
      offsetting: breakdown.offsetting.map((contribution) => offsettingRow(input, contribution)),
      projection: await projectionOf(input, whole),
    };
  },
});
