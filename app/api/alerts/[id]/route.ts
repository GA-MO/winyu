import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { alerts } from "@/lib/server/agent/collections";

type RouteContext = { params: Promise<{ id: string }> };
type ActionBody = { action?: unknown };

export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || body.action !== "dismiss") return badRequest();
  const alert = alerts().get((await context.params).id);
  if (!alert) return notFound();
  const updated = alerts().put({ ...alert, status: "dismissed", dismissCount: alert.dismissCount + 1 });
  return Response.json({ alert: updated });
}
