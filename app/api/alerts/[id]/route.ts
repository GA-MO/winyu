import type { Alert, Dim } from "@/lib/contracts";
import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { canJudge, dismissAlert, muteAlert, visibleAlert } from "@/lib/server/alerts";
import { thresholdKey } from "@/lib/engine/anomaly";
import { recordAction } from "@/lib/server/threads";
import { TH } from "@/lib/i18n/th";
import { rememberAction } from "@/lib/engine/memory";
import { alertRowOf } from "@/lib/cards/alert-row";
import { loadDictionary } from "@/lib/server/master-data";

type RouteContext = { params: Promise<{ id: string }> };
type ActionBody = { action?: unknown };

const ACTIONS = ["open", "mute", "dismiss"] as const;

type AlertAction = (typeof ACTIONS)[number];

const FORBIDDEN = { error: TH.inbox.judgeForbidden };

function isAction(value: unknown): value is AlertAction {
  return typeof value === "string" && ACTIONS.includes(value as AlertAction);
}

function subjectOf(alert: Alert) {
  return { metric: alert.metric, dims: Object.keys(alert.dims) as Dim[] };
}

/** An alert the user opened, said is not theirs, or (as its owner) said is not an anomaly; alerts outside their scope do not exist for them. */
export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || !isAction(body.action)) return badRequest();
  const alert = visibleAlert((await context.params).id, access);
  if (!alert) return notFound();
  const intentKey = `alert:${thresholdKey(alert.metric, alert.dims)}`;

  if (body.action === "open") {
    recordAction(access.userId, "alert_open", intentKey, null, null, subjectOf(alert));
    return Response.json({ ok: true });
  }
  if (body.action === "mute") {
    const { until } = muteAlert(alert, access);
    const row = alertRowOf(alert, await loadDictionary());
    rememberAction(access.userId, { type: "preference", value: TH.memory.notFollowing(`${row.metricLabel} ${row.scopeLabel}`) });
    recordAction(access.userId, "dismiss", intentKey, null, null, subjectOf(alert));
    return Response.json({ ok: true, until, note: TH.inbox.muted });
  }
  if (!canJudge(alert, access)) return Response.json(FORBIDDEN, { status: 403 });
  const result = dismissAlert(alert);
  recordAction(access.userId, "dismiss", intentKey, null, null, subjectOf(alert));
  return Response.json({ alert: result.alert, note: result.raised ? TH.engine.thresholdRaised(result.alert.dismissCount) : TH.inbox.dismissed });
}
