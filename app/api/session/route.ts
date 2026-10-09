import { NextResponse } from "next/server";
import { demoSignIn } from "@/lib/server/auth/demo-sign-in";
import { authMode } from "@/lib/server/auth/mode";
import { clearedSessionCookie } from "@/lib/server/auth/session-token";

const UNKNOWN_USER = { error: "ไม่พบผู้ใช้" };
const BAD_BODY = { error: "ต้องระบุ userId" };
const NOT_FOUND = { error: "ไม่พบหน้านี้" };

async function userIdOf(req: Request): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  return typeof body?.userId === "string" ? body.userId : null;
}

/** Demo sign-in as any persona; absent (404) unless WINYU_AUTH is demo. */
export async function POST(req: Request) {
  if (authMode() !== "demo") return NextResponse.json(NOT_FOUND, { status: 404 });
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json(BAD_BODY, { status: 400 });
  const signIn = demoSignIn(userId);
  if (!signIn.ok) return NextResponse.json(UNKNOWN_USER, { status: 404 });
  const response = NextResponse.json({ ok: true, userId: signIn.user.id, role: signIn.user.role });
  response.cookies.set(signIn.cookie);
  return response;
}

/** Signs out in every mode. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedSessionCookie());
  return response;
}
