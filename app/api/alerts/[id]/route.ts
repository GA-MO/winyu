import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { alertById, dismissAlert } from "@/lib/server/alerts";
import { TH } from "@/lib/i18n/th";

type RouteContext = { params: Promise<{ id: string }> };
type ActionBody = { action?: unknown };

export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || body.action !== "dismiss") return badRequest();
  const id = (await context.params).id;
  if (!alertById(id)) return notFound();
  const result = dismissAlert(id);
  if (!result) return notFound();
  return Response.json({ alert: result.alert, note: result.raised ? TH.engine.thresholdRaised(result.alert.dismissCount) : null });
}
