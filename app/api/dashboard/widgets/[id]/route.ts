import { badRequest, readBody, requireAccess, unauthenticated } from "../../../_guard";
import { removeWidget, setWidgetPinned } from "@/lib/server/dashboard";

type RouteContext = { params: Promise<{ id: string }> };
type WidgetAction = "pin" | "unpin" | "remove";
type ActionBody = { action?: unknown };

const ACTIONS: readonly WidgetAction[] = ["pin", "unpin", "remove"];

function isAction(value: unknown): value is WidgetAction {
  return typeof value === "string" && ACTIONS.includes(value as WidgetAction);
}

export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || !isAction(body.action)) return badRequest();
  const widgetId = (await context.params).id;
  if (body.action === "pin") return Response.json({ layout: setWidgetPinned(access, widgetId, true) });
  if (body.action === "unpin") return Response.json({ layout: setWidgetPinned(access, widgetId, false) });
  return Response.json({ layout: removeWidget(access, widgetId) });
}
