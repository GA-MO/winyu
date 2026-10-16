import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { findUser } from "@/lib/data/entities/users";
import { decideStaffRequest, STAFF_DECISIONS, type StaffDecision } from "@/lib/server/staff-requests";

type RouteContext = { params: Promise<{ id: string }> };
type DecisionBody = { decision?: unknown };

const CONFLICT = 409;

function isDecision(value: unknown): value is StaffDecision {
  return typeof value === "string" && (STAFF_DECISIONS as readonly string[]).includes(value);
}

/** The approver's answer to a leave or training request in their Inbox: sent to the system that holds it, and told to the person who asked. Leave and training stay answerable when sending work is turned off: they are HR paperwork. */
export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  const approver = access ? findUser(access.userId) : null;
  if (!approver) return unauthenticated();
  const body = await readBody<DecisionBody>(req);
  if (!body || !isDecision(body.decision)) return badRequest();
  const decided = await decideStaffRequest((await context.params).id, approver, body.decision);
  if (!decided.ok) return decided.reason === "not_found" ? notFound() : Response.json({ error: decided.reason }, { status: CONFLICT });
  return Response.json({ request: decided.request });
}
