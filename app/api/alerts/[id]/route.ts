import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { alertIntentKey, alertSubject, canJudge, dismissAlert, muteAlertForUser, visibleAlert } from "@/lib/server/alerts";
import { recordAction } from "@/lib/server/threads";
import { TH } from "@/lib/i18n/th";

type RouteContext = { params: Promise<{ id: string }> };
type ActionBody = { action?: unknown };

const ACTIONS = ["open", "mute", "dismiss"] as const;

type AlertAction = (typeof ACTIONS)[number];

const FORBIDDEN = { error: TH.inbox.judgeForbidden };

function isAction(value: unknown): value is AlertAction {
  return typeof value === "string" && ACTIONS.includes(value as AlertAction);
}

/** An alert the user opened, said is not theirs, or (as its owner) said is not an anomaly; alerts outside their scope do not exist for them. */
export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || !isAction(body.action)) return badRequest();
  const alert = visibleAlert((await context.params).id, access);
  if (!alert) return notFound();
  const intentKey = alertIntentKey(alert);

  if (body.action === "open") {
    recordAction(access.userId, "alert_open", intentKey, null, null, alertSubject(alert));
    return Response.json({ ok: true });
  }
  if (body.action === "mute") {
    const { until } = await muteAlertForUser(alert, access);
    return Response.json({ ok: true, until, note: TH.inbox.muted });
  }
  if (!canJudge(alert, access)) return Response.json(FORBIDDEN, { status: 403 });
  const result = dismissAlert(alert);
  recordAction(access.userId, "dismiss", intentKey, null, null, alertSubject(alert));
  return Response.json({ alert: result.alert, note: result.raised ? TH.engine.thresholdRaised(result.alert.dismissCount) : TH.inbox.dismissed });
}
