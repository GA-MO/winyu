import type { AccessContext, Dim, NextAction, NextActionContext, WidgetKind } from "@/lib/contracts";
import { responsibleFor } from "@/lib/access/raci";
import { metricLabel, metricSource, toneOf } from "@/lib/dashboard/metric-display";
import { GEO_LEVELS, finestGeoLevel } from "@/lib/semantic/geo";
import { askedQuery, effectiveFilters, pinnedSlice } from "@/lib/semantic/resolved";
import { focusTitle } from "@/lib/cards/focus";
import { METRICS, REGION_SCOPE_DIMS } from "@/lib/semantic/metrics";
import { findUser } from "@/lib/data/entities/users";
import { shortName } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

const MAX_ACTIONS = 3;
const MAX_LABEL_CHARS = 22;
const BAD_DELTA_PCT = 5;
const TIME_DIMS: readonly Dim[] = ["date", "week", "month"];
const DRILL_DIM_ORDER: readonly Dim[] = ["region", "province", "channel", "brand", "agent"];
const WIDGET_KIND_FOR_DIMS: Record<string, WidgetKind> = { time: "line", none: "metric", other: "bar" };

function allows(access: AccessContext, tool: NextAction["tool"]): boolean {
  return tool === null || access.toolAllow.includes(tool);
}

function widgetKindOf(context: NextActionContext): WidgetKind {
  if (context.drawnAs) return context.drawnAs;
  if (context.query.dims.length === 0) return WIDGET_KIND_FOR_DIMS.none;
  if (context.query.dims.some((dim) => TIME_DIMS.includes(dim))) return WIDGET_KIND_FOR_DIMS.time;
  return WIDGET_KIND_FOR_DIMS.other;
}

function sendAction(access: AccessContext, context: NextActionContext): NextAction | null {
  const owner = responsibleFor(context.query.metric, context.region, pinnedSlice(effectiveFilters(context.query)).agent ?? null);
  if (!owner || owner.userId === access.userId) return null;
  const { subject } = context.focus;
  return {
    id: "send",
    kind: "send",
    label: TH.next.send(shortName(owner.user.nameTh)),
    reason: owner.basis,
    tool: "send_card",
    input: {
      to: [owner.userId],
      ask: TH.next.sendAsk(subject ?? metricLabel(context.query.metric)),
      intent: "act",
      urgency: context.alertIds.length > 0 ? "now" : "today",
      card: { reads: [{ tool: "query_metric", input: askedQuery(context.query) }], alertIds: context.alertIds },
    },
    prompt: null,
  };
}

function accessAction(access: AccessContext, context: NextActionContext): NextAction | null {
  if (context.masked.length === 0) return null;
  const metric = context.query.metric;
  const owner = findUser(METRICS[metric].owner);
  if (!owner || owner.id === access.userId) return null;
  return {
    id: "request-access",
    kind: "request_access",
    label: TH.next.requestAccess(shortName(owner.nameTh)),
    reason: TH.next.requestAccessReason(metricLabel(metric), metricSource(metric)),
    tool: "send_email",
    input: {
      toUserId: owner.id,
      subject: TH.next.accessSubject(metricLabel(metric)),
      body: TH.next.accessBody(metricLabel(metric), context.masked.length),
    },
    prompt: null,
  };
}

function pinAction(context: NextActionContext, repeats: number): NextAction | null {
  if (repeats < 2) return null;
  return {
    id: "pin",
    kind: "pin",
    label: TH.next.pin,
    reason: TH.next.pinReason(repeats),
    tool: "pin_widget",
    input: { title: focusTitle(context.query.metric, context.focus.slice), kind: widgetKindOf(context), query: askedQuery(context.query) },
    prompt: null,
  };
}

function verifyAction(context: NextActionContext): NextAction | null {
  if (!context.verifyStep) return null;
  return {
    id: "verify",
    kind: "verify",
    label: context.focus.subject ? (shortLabel(TH.next.verifyScope(context.focus.subject)) ?? TH.next.verify) : TH.next.verify,
    reason: context.verifyStep,
    tool: null,
    input: null,
    prompt: context.verifyStep,
  };
}

/** True when the card's slice, the role's scope included, already sits at or inside that geo level. */
function coveredByScope(context: NextActionContext, dim: Dim): boolean {
  const level = GEO_LEVELS.indexOf(dim);
  return level !== -1 && level <= finestGeoLevel(pinnedSlice(effectiveFilters(context.query)));
}

/** True when the card already splits by a place at or below that level (agents, DCs, provinces under a region), so splitting by it would step back out (AI-223). */
function finerPlaceSplit(context: NextActionContext, dim: Dim): boolean {
  const level = REGION_SCOPE_DIMS.indexOf(dim);
  return level !== -1 && context.query.dims.some((used) => REGION_SCOPE_DIMS.indexOf(used) >= level);
}

function drillDim(context: NextActionContext): Dim | null {
  const used = new Set(context.query.dims);
  return DRILL_DIM_ORDER.find(
    (dim) => !used.has(dim) && !coveredByScope(context, dim) && !finerPlaceSplit(context, dim) && METRICS[context.query.metric].dims.includes(dim),
  ) ?? null;
}

function shortLabel(label: string): string | null {
  return label.length <= MAX_LABEL_CHARS ? label : null;
}

function drillAction(access: AccessContext, context: NextActionContext, causeOffered: boolean): NextAction | null {
  if (context.masked.length > 0) return null;
  const metric = metricLabel(context.query.metric);
  const { row } = context.focus;
  if (!causeOffered && row && context.deltaPercent !== null) {
    const short = shortLabel(row);
    return {
      id: "drill-why",
      kind: "drill",
      label: short ? TH.next.why(short) : TH.next.whyShort,
      reason: TH.next.whyReason(row),
      tool: null,
      input: null,
      prompt: TH.next.whyPrompt(metric, row),
    };
  }
  const dim = drillDim(context);
  if (!dim) return null;
  return {
    id: `drill-${dim}`,
    kind: "drill",
    label: TH.next.splitBy(TH.dash.dimUnit[dim]),
    reason: TH.next.splitReason(TH.dash.dimUnit[dim]),
    tool: null,
    input: null,
    prompt: TH.next.splitPrompt(metric, TH.dash.dimUnit[dim]),
  };
}

function needsOwner(context: NextActionContext): boolean {
  if (context.alertIds.length > 0) return true;
  if (context.deltaPercent === null || Math.abs(context.deltaPercent) < BAD_DELTA_PCT) return false;
  return toneOf(context.query.metric, context.deltaPercent) === "bad";
}

/**
 * What the card offers to do next, decided by rules rather than by the model: request access to masked fields,
 * hand the problem to the person accountable for it, pin a question the user keeps asking, verify an alert, drill in.
 */
export function nextActionsFor(access: AccessContext, context: NextActionContext, repeats = 0): NextAction[] {
  const verify = verifyAction(context);
  const candidates = [
    accessAction(access, context),
    needsOwner(context) ? sendAction(access, context) : null,
    verify,
    pinAction(context, repeats),
    drillAction(access, context, verify !== null),
  ];
  return candidates
    .filter((action): action is NextAction => action !== null && allows(access, action.tool))
    .slice(0, MAX_ACTIONS);
}
