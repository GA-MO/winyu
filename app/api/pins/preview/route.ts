import { z } from "zod";
import { metricQueryInputSchema, widgetKindSchema } from "@/lib/contracts";
import { pinHero } from "@/lib/server/tools/pin-widget";
import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";

const bodySchema = z.object({ title: z.string().min(1).max(200), kind: widgetKindSchema, query: metricQueryInputSchema, question: z.string().max(500).nullable() });

/** What the pin approval shows before anything is pinned: the figure the widget will lead with for the signed-in person, drawn in its kind and worked out as pin_widget will pin it (`question` is the one that drew the card it pins). No model call. */
export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const parsed = bodySchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  return Response.json({ hero: await pinHero(parsed.data.title, parsed.data.kind, parsed.data.query, access, parsed.data.question) });
}
