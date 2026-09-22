import { badRequest, readBody, requireAccess, unauthenticated } from "../_guard";
import { quickActionsFor } from "@/lib/server/quick-actions";
import { recordAction } from "@/lib/server/threads";

type ClickBody = { intentKey?: unknown; prompt?: unknown; kind?: unknown };

const KINDS = ["quick_action", "dismiss", "alert_open", "widget_view"] as const;

type Kind = (typeof KINDS)[number];

function isKind(value: unknown): value is Kind {
  return typeof value === "string" && KINDS.includes(value as Kind);
}

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json({ actions: quickActionsFor(access) });
}

export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ClickBody>(req);
  if (!body || typeof body.intentKey !== "string") return badRequest();
  const kind = isKind(body.kind) ? body.kind : "quick_action";
  const prompt = typeof body.prompt === "string" ? body.prompt : null;
  return Response.json({ event: recordAction(access.userId, kind, body.intentKey, prompt, null) });
}
