import type { AccessContext, ActionEvent, Dim, MetricId, MetricQuery, MetricResult, QuickAction } from "@/lib/contracts";
import { METRICS, TIME_DIMS } from "@/lib/semantic/metrics";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { sharpestHarm, weakestRow } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { spaceLatinTh } from "@/lib/i18n/format";

const MAX_FOLLOW_UPS = 3;
const MAX_LABEL_CHARS = 24;
const BAD_DELTA_PCT = 5;
const LEARN_WINDOW_DAYS = 30;
const LEARN_WEIGHT = 0.3;
const DAY_MS = 86_400_000;
const PARENTHETICAL = /\s*\(.*\)$/;
const INTENT_PREFIX = "follow|";
const SPLIT_ORDER: readonly Dim[] = ["region", "channel", "brand", "agent", "dc", "business_unit", "department"];
const TREND_GRAINS: readonly { dim: Dim; label: string; prompt: string }[] = [
  { dim: "week", label: TH.follow.trendWeekly, prompt: TH.follow.lastWeeks },
  { dim: "month", label: TH.follow.trendMonthly, prompt: TH.follow.lastMonths },
];
const CHILD_DIMS: Partial<Record<Dim, readonly Dim[]>> = {
  region: ["agent", "dc", "plant", "province"],
  province: ["agent"],
  channel: ["agent"],
  business_unit: ["brand"],
  brand: ["sku"],
  dc: ["sku"],
};
const FORECAST_SOURCES: Partial<Record<MetricId, { metric: MetricId; dims: readonly Dim[] }>> = {
  net_sales_volume: { metric: "net_sales_volume", dims: ["region", "brand"] },
  target_attainment: { metric: "net_sales_volume", dims: ["region", "brand"] },
  days_of_cover: { metric: "days_of_cover", dims: ["dc", "sku"] },
};
const BASE_SCORE: Record<FollowUpKind, number> = { why: 0.6, drill_down: 0.7, split: 0.65, trend: 0.5, compare_year: 0.45, forecast: 0.55 };
const BAD_BOOST: Partial<Record<FollowUpKind, number>> = { why: 0.35, drill_down: 0.15, trend: 0.15, forecast: 0.1 };

export type FollowUpKind = "why" | "drill_down" | "split" | "trend" | "compare_year" | "forecast";

export const FOLLOW_UP_KINDS: readonly FollowUpKind[] = ["why", "drill_down", "split", "trend", "compare_year", "forecast"];

export type FollowUpInput = {
  query: MetricQuery;
  result: Extract<MetricResult, { ok: true }>;
  taken: readonly string[];
};

type Draft = { kind: FollowUpKind; label: string; prompt: string; reason: string };

type Facts = {
  query: MetricQuery;
  metric: string;
  taken: ReadonlySet<string>;
  rankDim: Dim | null;
  hasTime: boolean;
  focus: string | null;
  bad: boolean;
};

function shortMetric(metric: MetricId): string {
  return metricLabel(metric).replace(PARENTHETICAL, "");
}

function fits(label: string): boolean {
  return label.length <= MAX_LABEL_CHARS;
}

function focusOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>): string | null {
  return weakestRow(query, result)?.label ?? sharpestHarm(query, result, BAD_DELTA_PCT)?.label ?? null;
}

function factsOf(input: FollowUpInput): Facts {
  const { query, result } = input;
  const delta = result.headline.deltaPercent;
  const focus = focusOf(query, result);
  return {
    query,
    metric: metricLabel(query.metric),
    taken: new Set(input.taken.map(spaceLatinTh)),
    rankDim: query.dims.find((dim) => !TIME_DIMS.includes(dim)) ?? null,
    hasTime: query.dims.some((dim) => TIME_DIMS.includes(dim)),
    focus,
    bad: (delta !== null && delta <= -BAD_DELTA_PCT) || sharpestHarm(query, result, BAD_DELTA_PCT) !== null,
  };
}

function supports(metric: MetricId, dim: Dim): boolean {
  return METRICS[metric].dims.includes(dim);
}

function whyDraft(facts: Facts): Draft | null {
  if (!facts.focus || !facts.rankDim) return null;
  return {
    kind: "why",
    label: fits(facts.focus) ? TH.follow.why(facts.focus) : TH.follow.whyShort,
    prompt: TH.next.whyPrompt(facts.metric, facts.focus),
    reason: TH.follow.whyReason(facts.focus),
  };
}

function drillDownDraft(facts: Facts): Draft | null {
  if (!facts.focus || !facts.rankDim) return null;
  const child = (CHILD_DIMS[facts.rankDim] ?? []).find((dim) => supports(facts.query.metric, dim) && !facts.query.dims.includes(dim));
  if (!child) return null;
  const unit = TH.dash.dimUnit[child];
  return {
    kind: "drill_down",
    label: fits(facts.focus) ? TH.follow.drillDown(unit, facts.focus) : TH.follow.drillDownShort(unit),
    prompt: TH.follow.drillDownPrompt(facts.metric, facts.focus, unit),
    reason: TH.follow.drillDownReason(facts.focus),
  };
}

function seesOneRegion(access: AccessContext): boolean {
  return access.regions !== "all" && access.regions.length === 1;
}

function splitDraft(facts: Facts, access: AccessContext): Draft | null {
  if (facts.rankDim) return null;
  const dim = SPLIT_ORDER.find(
    (entry) =>
      supports(facts.query.metric, entry) &&
      !(entry === "region" && seesOneRegion(access)) &&
      !facts.taken.has(spaceLatinTh(TH.next.splitPrompt(facts.metric, TH.dash.dimUnit[entry]))),
  );
  if (!dim) return null;
  const unit = TH.dash.dimUnit[dim];
  return { kind: "split", label: TH.next.splitBy(unit), prompt: TH.next.splitPrompt(facts.metric, unit), reason: TH.next.splitReason(unit) };
}

function trendDraft(facts: Facts): Draft | null {
  const grain = TREND_GRAINS.find((entry) => supports(facts.query.metric, entry.dim));
  if (facts.hasTime || !grain) return null;
  const of = facts.focus && facts.bad ? facts.focus : null;
  return {
    kind: "trend",
    label: facts.bad ? TH.follow.trendSinceWhen : grain.label,
    prompt: TH.follow.trendPrompt(facts.metric, of, grain.prompt),
    reason: facts.bad ? TH.follow.trendBadReason : TH.follow.trendReason,
  };
}

function compareYearDraft(facts: Facts): Draft | null {
  if (facts.query.compare === "prev_year" || facts.query.metric === "target_attainment") return null;
  const unit = facts.rankDim ? TH.dash.dimUnit[facts.rankDim] : null;
  return { kind: "compare_year", label: TH.follow.compareYear, prompt: TH.follow.compareYearPrompt(facts.metric, unit), reason: TH.follow.compareYearReason };
}

function forecastDraft(facts: Facts, access: AccessContext): Draft | null {
  const source = FORECAST_SOURCES[facts.query.metric];
  if (!source || !access.toolAllow.includes("get_forecast") || access.metricAcl[source.metric] !== "full") return null;
  const of = facts.focus && facts.rankDim && source.dims.includes(facts.rankDim) ? facts.focus : null;
  const isTarget = facts.query.metric === "target_attainment";
  return {
    kind: "forecast",
    label: isTarget ? TH.follow.forecastTarget : TH.follow.forecast,
    prompt: isTarget ? TH.follow.forecastTargetPrompt(shortMetric(source.metric), of) : TH.follow.forecastPrompt(shortMetric(source.metric), of),
    reason: TH.follow.forecastReason,
  };
}

/** How often this user pressed each kind of follow-up lately, as a share of all their follow-up presses. */
export function learnedKindShare(events: readonly ActionEvent[], userId: string, now = Date.now()): Partial<Record<FollowUpKind, number>> {
  const recent = events.filter(
    (event) => event.userId === userId && event.kind === "follow_up" && (now - new Date(event.at).getTime()) / DAY_MS <= LEARN_WINDOW_DAYS,
  );
  if (recent.length === 0) return {};
  const share: Partial<Record<FollowUpKind, number>> = {};
  for (const kind of FOLLOW_UP_KINDS) {
    const count = recent.filter((event) => event.intentKey === followUpIntent(kind)).length;
    if (count > 0) share[kind] = count / recent.length;
  }
  return share;
}

export function followUpIntent(kind: FollowUpKind): string {
  return `${INTENT_PREFIX}${kind}`;
}

export function isFollowUpIntent(intentKey: string): boolean {
  return intentKey.startsWith(INTENT_PREFIX);
}

/**
 * The questions worth asking after this result, decided by rules from its shape rather than by the model:
 * why the weakest row, open it one level down, split a single number, see the trend, compare with last year, look ahead.
 * Ranked by what the result shows and by which kinds this user tends to press; never repeats a question the card already offers.
 */
export function followUpsFor(access: AccessContext, input: FollowUpInput, learned: Partial<Record<FollowUpKind, number>> = {}): QuickAction[] {
  const facts = factsOf(input);
  const drafts = [whyDraft(facts), drillDownDraft(facts), splitDraft(facts, access), trendDraft(facts), compareYearDraft(facts), forecastDraft(facts, access)];
  return drafts
    .filter((draft): draft is Draft => draft !== null && !facts.taken.has(spaceLatinTh(draft.prompt)))
    .map((draft) => ({
      id: `fu-${draft.kind}`,
      label: spaceLatinTh(draft.label),
      prompt: spaceLatinTh(draft.prompt),
      reason: draft.reason,
      intentKey: followUpIntent(draft.kind),
      score: BASE_SCORE[draft.kind] + (facts.bad ? (BAD_BOOST[draft.kind] ?? 0) : 0) + LEARN_WEIGHT * (learned[draft.kind] ?? 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_FOLLOW_UPS);
}
