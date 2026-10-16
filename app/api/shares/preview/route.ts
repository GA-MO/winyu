import { z } from "zod";
import { findUser } from "@/lib/data/entities/users";
import { sharedCardSchema } from "@/lib/share/card";
import { sendPreview } from "@/lib/server/share/preview";
import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";

const bodySchema = z.object({ card: sharedCardSchema, alertIds: z.array(z.string().min(1).max(120)).max(10).optional() });

/** What the send sheet (and the send approval, which is the same sheet filled in) shows before anything leaves: whom to put first, what the card's numbers say for the sender, and the goal that would close the matter. No model call. */
export async function POST(req: Request) {
  const access = await requireAccess();
  const sender = access ? findUser(access.userId) : null;
  if (!sender) return unauthenticated();
  const parsed = bodySchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  return Response.json(await sendPreview(parsed.data.card, sender, parsed.data.alertIds ?? []));
}
