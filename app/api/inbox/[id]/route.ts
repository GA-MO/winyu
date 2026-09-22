import { randomUUID } from "node:crypto";
import type { ContextPacket } from "@/lib/contracts";
import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { notifications, packets } from "@/lib/server/agent/collections";
import { findUser } from "@/lib/data/entities/users";

type RouteContext = { params: Promise<{ id: string }> };
type PacketAction = "accept" | "need_info" | "return";
type ActionBody = { action?: unknown; text?: unknown };

const ACTIONS: readonly PacketAction[] = ["accept", "need_info", "return"];
const NEXT_STATUS: Record<PacketAction, ContextPacket["status"]> = { accept: "accepted", need_info: "need_info", return: "returned" };
const DEFAULT_TEXTS: Record<PacketAction, string> = {
  accept: "รับงานแล้ว กำลังตรวจสอบข้อมูลครับ",
  need_info: "ขอข้อมูลเพิ่มเติมก่อนเริ่มตรวจสอบครับ",
  return: "ขอตีกลับเพราะไม่อยู่ในขอบเขตที่ผมดูแลครับ",
};

function isAction(value: unknown): value is PacketAction {
  return typeof value === "string" && ACTIONS.includes(value as PacketAction);
}

export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || !isAction(body.action)) return badRequest();

  const packet = packets().get((await context.params).id);
  if (!packet || packet.toUserId !== access.userId) return notFound();

  const at = new Date().toISOString();
  const text = typeof body.text === "string" && body.text.trim() ? body.text.trim() : DEFAULT_TEXTS[body.action];
  const updated = packets().put({
    ...packet,
    status: NEXT_STATUS[body.action],
    thread: [...packet.thread, { userId: access.userId, at, text }],
    updatedAt: at,
  });

  notifications().put({
    id: randomUUID(),
    userId: packet.fromUserId,
    at,
    kind: "reply",
    refId: packet.id,
    read: false,
    title: `${findUser(access.userId)?.nameTh ?? access.userId}: ${text}`,
  });

  return Response.json({ packet: updated });
}
