import { cookies } from "next/headers";
import { findUser } from "@/lib/data/entities/users";
import { clearedSessionCookie, sessionCookie } from "@/lib/server/session";

const UNKNOWN_USER = { error: "ไม่พบผู้ใช้" };
const BAD_BODY = { error: "ต้องระบุ userId" };

async function userIdOf(req: Request): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  return typeof body?.userId === "string" ? body.userId : null;
}

export async function POST(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return Response.json(BAD_BODY, { status: 400 });
  const user = findUser(userId);
  if (!user) return Response.json(UNKNOWN_USER, { status: 404 });
  (await cookies()).set(sessionCookie(user.id));
  return Response.json({ ok: true, userId: user.id, role: user.role });
}

export async function DELETE() {
  (await cookies()).set(clearedSessionCookie());
  return Response.json({ ok: true });
}
