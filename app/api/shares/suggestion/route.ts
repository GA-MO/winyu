import { z } from "zod";
import { sharedCardSchema } from "@/lib/share/card";
import { suggestedRecipient } from "@/lib/server/share/suggest";
import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";

const bodySchema = z.object({ card: sharedCardSchema });

/** The colleague the sheet puts first for a card: the RACI owner of what the card reads, never the sender; no model call. */
export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const parsed = bodySchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  const owner = suggestedRecipient(parsed.data.card, access.userId);
  return Response.json({ userId: owner?.userId ?? null });
}
