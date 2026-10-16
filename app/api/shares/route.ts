import { handoffEnabled } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { shareRequestSchema } from "@/lib/share/card";
import { createShare } from "@/lib/server/share/deliver";
import { receiptsOf, sharePath } from "@/lib/server/share/shares";
import { badRequest, readBody, requireAccess, unauthenticated } from "../_guard";

/** Sends a card as a matter: the person's own press, so no approval card; the reads are checked and stored, the recipients told in Winyu, and the send audited. Closed while the admin has sending work turned off. */
export async function POST(req: Request) {
  const access = await requireAccess();
  const sender = access ? findUser(access.userId) : null;
  if (!sender) return unauthenticated();
  if (!handoffEnabled()) return Response.json({ error: TH.inbox.handoffClosed }, { status: 403 });
  const parsed = shareRequestSchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  const outcome = await createShare(sender, parsed.data);
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 422 });
  return Response.json({ code: outcome.share.id, path: sharePath(outcome.share.id), title: outcome.share.title, receipts: receiptsOf(outcome.share), grants: outcome.grants, hidden: outcome.hidden });
}
