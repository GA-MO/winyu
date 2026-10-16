import { z } from "zod";
import { findUser } from "@/lib/data/entities/users";
import { SHARE_RECIPIENTS_MAX, sharedCardSchema } from "@/lib/share/card";
import { recipientScopesFor } from "@/lib/server/grants";
import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";

const bodySchema = z.object({ card: sharedCardSchema, recipients: z.array(z.string().min(1)).max(SHARE_RECIPIENTS_MAX) });

/** What a card would hide from each chosen recipient if the signed-in person sent it now, so the sheet can say so before sending; no model call. */
export async function POST(req: Request) {
  const access = await requireAccess();
  const sender = access ? findUser(access.userId) : null;
  if (!sender) return unauthenticated();
  const parsed = bodySchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  return Response.json({ scopes: recipientScopesFor(sender, parsed.data.card, parsed.data.recipients) });
}
