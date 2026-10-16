import { z } from "zod";
import { handoffEnabled } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { MATTER_ASK_MAX } from "@/lib/share/card";
import { actOnMatter, briefOf, type MatterOutcome } from "@/lib/server/share/act";
import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";

type RouteContext = { params: Promise<{ code: string }> };
type Refusal = Extract<MatterOutcome, { ok: false }>["refusal"];

const line = z.string().trim().min(1).max(MATTER_ASK_MAX);

const pressSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("accept") }),
  z.object({ kind: z.literal("ask"), text: line }),
  z.object({ kind: z.literal("reply"), text: line }),
  z.object({ kind: z.literal("pass_on"), toUserId: z.string().min(1) }),
  z.object({ kind: z.literal("not_mine") }),
  z.object({ kind: z.literal("done") }),
]);

const REFUSAL_STATUS: Record<Refusal, number> = { not_found: 404, not_allowed: 403, closed: 409, fyi: 422, bad_target: 422 };

/** One press on a matter by the signed-in person (รับ, ขอข้อมูลเพิ่ม, ตอบ, ส่งต่อ, ไม่ใช่ของผม, เสร็จ): applied only when the transition table allows it, refused with a 4xx otherwise. Closed while the admin has sending work turned off. No model call. */
export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  const actor = access ? findUser(access.userId) : null;
  if (!actor) return unauthenticated();
  if (!handoffEnabled()) return Response.json({ error: TH.inbox.handoffClosed }, { status: 403 });
  const parsed = pressSchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  const outcome = actOnMatter(actor, (await context.params).code, parsed.data);
  if (!outcome.ok) return Response.json({ error: TH.matter.refused[outcome.refusal], refusal: outcome.refusal }, { status: REFUSAL_STATUS[outcome.refusal] });
  return Response.json({ matter: briefOf(outcome.matter, actor.id), status: outcome.matter.status });
}
