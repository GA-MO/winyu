import { findUser } from "@/lib/data/entities/users";
import { shareRequestSchema } from "@/lib/share/card";
import { createShare } from "@/lib/server/share/deliver";
import { receiptsOf, sharePath, sharesSentBy } from "@/lib/server/share/shares";
import { badRequest, readBody, requireAccess, unauthenticated } from "../_guard";

/** The shares the signed-in person sent, with who got them on which channel and how often they were opened. */
export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json({ shares: sharesSentBy(access.userId) });
}

/** Shares a card: the person's own press, so no approval card; the reads are checked, stored and sent as a link, and the share is audited. */
export async function POST(req: Request) {
  const access = await requireAccess();
  const sender = access ? findUser(access.userId) : null;
  if (!sender) return unauthenticated();
  const parsed = shareRequestSchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  const outcome = await createShare(sender, parsed.data);
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 422 });
  return Response.json({ code: outcome.share.id, path: sharePath(outcome.share.id), title: outcome.share.title, receipts: receiptsOf(outcome.share), grants: outcome.grants });
}
