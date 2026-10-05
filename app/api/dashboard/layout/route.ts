import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { layoutFor, layoutHistory, rollbackToYesterday } from "@/lib/server/dashboard";

type LayoutBody = { action?: unknown };

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json({ layout: layoutFor(access), history: layoutHistory(access).map(({ version, savedAt }) => ({ version, savedAt })) });
}

export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<LayoutBody>(req);
  if (!body || body.action !== "rollback") return badRequest();
  const layout = rollbackToYesterday(access);
  return layout ? Response.json({ layout }) : notFound();
}
