import type { z } from "zod";
import { explainGapInputSchema, type AccessContext, type Dim, type MetricQuery, type MetricResult, type MetricRow, type MonthEndProjection } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { formatForSummary, priorPeriodOf } from "@/lib/semantic/engine";
import { formatThaiDate } from "@/lib/data/dates";
import { metricDef } from "@/lib/semantic/metrics";
import { formatDelta } from "@/lib/dashboard/metric-display";
import { breakDownGap, fellHarder, formatShare, isBroad, leadingParts, mainCauses, type Contribution, type GapBreakdown, type GapPart } from "@/lib/engine/gap";
import { TH } from "@/lib/i18n/th";
import { runMetric } from "@/lib/server/metrics";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const OTHERS = "ที่เหลือรวมกัน";
const NOT_ADDITIVE = "แยกช่องว่างได้เฉพาะเมตริกที่รวมยอดได้ (ปริมาณ มูลค่า ยอดค้าง) ถ้าเป็นสัดส่วนหรือ % ให้ใช้เมตริกยอดที่อยู่เบื้องหลังแทน";
const COMPARE_LABELS = { target: "เป้า", prev_period: "ช่วงก่อนหน้า", prev_year: "ปีก่อน" } as const;
const CHECKED_SPLITS: readonly Dim[] = ["channel", "brand"];
const PERCENT = 100;

type Input = z.infer<typeof explainGapInputSchema>;

function amountOf(input: Input, value: number): string {
  const def = metricDef(input.metric);
  return def ? formatForSummary(def, value) : String(value);
}

/** What the gap is measured against, named: the paced target in a month still running, the target, or the prior days by name and dates ("สัปดาห์ก่อน (16 พ.ย. 2569 – 19 พ.ย. 2569)"), so the card never says only "ช่วงก่อนหน้า". */
function versusOf(input: Input, projection: MonthEndProjection | null): string {
  if (input.compare === "target") return projection ? TH.read.pacedGoal : COMPARE_LABELS.target;
  const prior = priorPeriodOf(input.metric, input.compare, input.range);
  return prior ? TH.read.priorRange(prior.name, formatThaiDate(prior.from), formatThaiDate(prior.to)) : COMPARE_LABELS[input.compare];
}

function queryOf(input: Input, dims: MetricQuery["dims"]): MetricQuery {
  return { metric: input.metric, dims, filters: input.filters, range: input.range, grain: "day", compare: input.compare, limit: null, sort: null };
}

function partOf(row: MetricRow, label: string): GapPart {
  return { label, value: Number(row.value ?? 0), compare: Number(row.compare_value ?? 0) };
}

function signed(input: Input, amount: number): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${amountOf(input, Math.abs(Math.round(amount)))}`;
}

/** How a part's share of the gap is written for the model to copy: with the gap it divides, the gap to date in a month still running, so a reply never sets it beside the month-end shortfall as that shortfall's share (AI-248). */
type ShareWords = (share: number) => string;

function shareWordsOf(toDate: boolean): ShareWords {
  return (share) => TH.cards.gap.shareOfGap(formatShare(share), toDate);
}

function contributionRow(input: Input, contribution: Contribution, words: ShareWords) {
  return { label: contribution.label, gap_label: signed(input, contribution.gap), share_label: words(contribution.share) };
}

function offsettingRow(input: Input, contribution: Contribution) {
  return { label: contribution.label, gap_label: signed(input, contribution.gap) };
}

/** Where the month ends, each amount under the name of what it is: the share done so far and what is left from today, then the month end and what it will still lack then, so the two shortfalls are never paired the wrong way (AI-204). */
function projectionOf(projection: MonthEndProjection) {
  return {
    label: `สิ้นเดือน ถ้าขายเท่า ${projection.recentDays} วันล่าสุด`,
    basis: `วันที่เหลือของเดือนขายเท่าค่าเฉลี่ย ${projection.recentDays} วันล่าสุด และเป้ากระจายเท่ากันทุกวัน`,
    projected_label: projection.projected,
    month_target_label: projection.monthTarget,
    attainment_label: projection.attainment,
    month_end_short_label: projection.endShortBy ?? null,
    done_so_far_label: `${projection.attainmentToDate} ${TH.read.ofMonthTarget}`,
    left_from_today_label: projection.remaining,
  };
}

function sharesOverWhole(breakdown: GapBreakdown): boolean {
  return [...breakdown.contributors, ...(breakdown.rest ? [breakdown.rest] : [])].some((part) => part.share > 1);
}

function partsLine(parts: readonly Contribution[], words: ShareWords): string {
  return parts.map((part) => TH.cards.gap.partShare(part.label, words(part.share))).join(" และ ");
}

/** Why no part, or no single part, is the gap's main cause: spread so wide that the biggest is under a fifth, the leading parts about equal yet together under half of it, or the leading parts about equal and making it together. */
function causeNoteOf(breakdown: GapBreakdown, words: ShareWords): string | null {
  const [biggest] = breakdown.contributors;
  if (!biggest) return null;
  if (isBroad(breakdown)) return TH.cards.gap.broad(biggest.label, formatShare(biggest.share));
  const causes = mainCauses(breakdown.contributors);
  if (causes.length > 1) return TH.cards.gap.joint(partsLine(causes, words));
  return causes.length === 0 ? TH.cards.gap.even(partsLine(leadingParts(breakdown.contributors), words)) : null;
}

/** What the model must know before naming a cause: shares above 100%, and why no single part is the main cause when none is. */
function shareNoteOf(breakdown: GapBreakdown, words: ShareWords): string | null {
  const notes = [...(sharesOverWhole(breakdown) ? [TH.cards.gap.overHundred] : []), causeNoteOf(breakdown, words)].filter((note): note is string => note !== null);
  return notes.length > 0 ? notes.join(" · ") : null;
}

function isFailure(result: MetricResult): result is Extract<MetricResult, { ok: false }> {
  return !result.ok;
}

function partsOf(split: Extract<MetricResult, { ok: true }>, dim: Dim): GapPart[] {
  return split.rows.map((row) => partOf(row, String(row[dim] ?? "")));
}

function changeOf(part: GapPart): number {
  return part.compare === 0 ? 0 : ((part.value - part.compare) / part.compare) * PERCENT;
}

function changeLabel(change: number): string {
  return (formatDelta(change) ?? "0%").replace("-", "−");
}

function rangeLabel(changes: readonly number[]): string {
  const [low, high] = [Math.min(...changes), Math.max(...changes)].map(changeLabel);
  return low === high ? low : TH.read.between(low, high);
}

/** One other split checked for parts that moved harder than the whole, each with its gap, share and own change, and one line the reply may copy: who moved harder, or that every part moved alike and by how much. */
function splitCheck(input: Input, whole: GapPart, dim: Dim, parts: readonly GapPart[], words: ShareWords) {
  const label = TH.dash.dimUnit[dim] ?? dim;
  const harder = fellHarder(whole, parts);
  const gap = whole.value - whole.compare;
  const changes = parts.filter((part) => part.compare !== 0).map(changeOf);
  return {
    split_label: label,
    moved_harder: harder.map((part) => ({ ...contributionRow(input, { label: part.label, gap: part.value - part.compare, share: gap === 0 ? 0 : (part.value - part.compare) / gap }, words), change_label: changeLabel(changeOf(part)) })),
    note: harder.length > 0
      ? TH.cards.gap.movedHarder(harder.map((part) => `${part.label} ${changeLabel(changeOf(part))}`).join(", "), changeLabel(changeOf(whole)))
      : TH.cards.gap.movedAlike(label, changes.length > 0 ? rangeLabel(changes) : changeLabel(changeOf(whole))),
  };
}

/** Splits other than the one asked that a gap with no main cause is also read along: those the metric has, that the question did not narrow to one value. */
function otherSplitsOf(input: Input): Dim[] {
  const dims = metricDef(input.metric)?.dims ?? [];
  return CHECKED_SPLITS.filter((dim) => dim !== input.split && dims.includes(dim) && (input.filters[dim]?.length ?? 0) !== 1);
}

/** The same gap along each other split, each with the parts that moved harder than the whole or none, so a reply names a cause that was checked or says which splits moved alike (AI-214). */
async function otherSplits(input: Input, whole: GapPart, access: AccessContext, words: ShareWords) {
  const dims = otherSplitsOf(input);
  const results = await Promise.all(dims.map((dim) => runMetric(queryOf(input, [dim]), access)));
  return dims.flatMap((dim, index) => {
    const result = results[index];
    return result?.ok ? [splitCheck(input, whole, dim, partsOf(result, dim), words)] : [];
  });
}

export const explainGapTool = defineTool({
  name: "explain_gap",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description:
    "Split the gap between actual and target (or a prior period) of an additive metric by one dimension: each part's own gap and its share of the whole gap, computed by Winyu, plus the parts pulling the other way. With compare=target over month-to-date it also projects where the month ends at the recent pace: month_end_short_label is what the month will still lack then, left_from_today_label what is left to sell from today, never one for the other. Call it before saying who or what caused a shortfall; copy share_label as is, never compute a share yourself. When share_note says no part, or no single part, is the main cause, name none as the main cause; other_splits then says what the same gap shows by channel and by brand: name a part from moved_harder as the checked cause, or copy each note to say those splits moved alike.",
  input: explainGapInputSchema,
  execute: async (input: Input) => {
    const access = currentAccess();
    const [total, split] = await Promise.all([runMetric(queryOf(input, []), access), runMetric(queryOf(input, [input.split]), access)]);
    if (isFailure(total)) return total;
    if (isFailure(split)) return split;
    if (total.headline.aggregate !== "sum") return { ok: false as const, error: NOT_ADDITIVE, code: "BAD_QUERY" as const };
    const whole = partOf(total.rows[0] ?? {}, metricLabel(input.metric));
    const breakdown = breakDownGap(whole, partsOf(split, input.split));
    const projection = total.headline.projection ?? null;
    const versus = versusOf(input, projection);
    const words = shareWordsOf(projection !== null);
    const checked = mainCauses(breakdown.contributors).length === 0 && breakdown.contributors.length > 0 ? await otherSplits(input, whole, access, words) : null;
    return {
      ok: true as const,
      summary: `${metricLabel(input.metric)} ${total.headline.periodLabel}: จริง ${amountOf(input, whole.value)} · ${versus} ${amountOf(input, whole.compare)} · ช่องว่าง ${signed(input, breakdown.gap)}`,
      period_label: total.headline.periodLabel,
      actual_label: amountOf(input, whole.value),
      compare_label: `${versus} ${amountOf(input, whole.compare)}`,
      gap_label: signed(input, breakdown.gap),
      change_label: input.compare !== "target" && whole.compare !== 0 ? changeLabel(changeOf(whole)) : null,
      attainment_label: input.compare === "target" && !projection && whole.compare > 0 ? `${((whole.value / whole.compare) * 100).toFixed(1)}%` : null,
      contributors: breakdown.contributors.map((contribution) => contributionRow(input, contribution, words)),
      rest: breakdown.rest ? contributionRow(input, { ...breakdown.rest, label: OTHERS }, words) : null,
      offsetting: breakdown.offsetting.map((contribution) => offsettingRow(input, contribution)),
      share_note: shareNoteOf(breakdown, words),
      other_splits: checked,
      projection: projection ? projectionOf(projection) : null,
      scope_labels: total.provenance.filterLabels ?? [],
    };
  },
});
