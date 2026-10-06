import { z } from "zod";
import { findUser } from "@/lib/data/entities/users";
import { requestGrant, type RequestProblem } from "@/lib/server/grants";
import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";

const REASON_MAX = 300;
const STATUS_OF: Record<RequestProblem, number> = { missing: 404, not_yours: 403, nothing_hidden: 422, no_approver: 422 };

const requestSchema = z.object({ shareCode: z.string().min(1).max(40), reason: z.string().max(REASON_MAX) });

/** A recipient asks for what a shared card hid from them; the slice is read from the stored share, never from the body. */
export async function POST(req: Request) {
  const access = await requireAccess();
  const requester = access ? findUser(access.userId) : null;
  if (!requester) return unauthenticated();
  const parsed = requestSchema.safeParse(await readBody<unknown>(req));
  if (!parsed.success) return badRequest();
  const outcome = await requestGrant(requester, parsed.data.shareCode, parsed.data.reason);
  if (!outcome.ok) return Response.json({ error: outcome.problem }, { status: STATUS_OF[outcome.problem] });
  return Response.json({ id: outcome.request.id, approverName: findUser(outcome.request.approverId)?.nameTh ?? outcome.request.approverId });
}
