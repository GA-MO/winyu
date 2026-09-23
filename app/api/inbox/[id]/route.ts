import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { packets } from "@/lib/server/agent/collections";
import { actOnPacket, defaultReply, type PacketAction } from "@/lib/server/handoff";
import { TH } from "@/lib/i18n/th";
import { handoffEnabled } from "@/lib/access/enforce";
import { VERDICTS, recordOutcome, type Verdict } from "@/lib/server/outcomes";

type RouteContext = { params: Promise<{ id: string }> };
type ActionBody = { action?: unknown; text?: unknown; outcome?: unknown; verdict?: unknown };

function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && VERDICTS.includes(value as Verdict);
}

const ACTIONS: readonly PacketAction[] = ["accept", "need_info", "return", "resolve"];

function isAction(value: unknown): value is PacketAction {
  return typeof value === "string" && ACTIONS.includes(value as PacketAction);
}

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || !isAction(body.action)) return badRequest();
  if (!handoffEnabled()) return Response.json({ error: TH.inbox.handoffClosed }, { status: 403 });

  const packet = packets().get((await context.params).id);
  if (!packet || packet.toUserId !== access.userId) return notFound();

  const outcome = trimmed(body.outcome);
  if (body.action === "resolve" && !outcome) return Response.json({ error: TH.handoff.closeNeedsOutcome }, { status: 400 });
  const judged = body.action === "resolve" && packet.alertIds.length > 0;
  if (judged && !isVerdict(body.verdict)) return Response.json({ error: TH.lesson.needsVerdict }, { status: 400 });
  if (judged && isVerdict(body.verdict) && outcome) recordOutcome(packet, access.userId, body.verdict, outcome);

  const text = trimmed(body.text) ?? (body.action === "resolve" ? (outcome as string) : defaultReply(body.action));
  return Response.json({ packet: actOnPacket(packet, access, body.action, text, outcome) });
}
