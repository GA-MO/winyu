import { NextResponse } from "next/server";
import { demoSignIn } from "@/lib/server/auth/demo-sign-in";
import { safeNextPath } from "@/lib/server/auth/next-path";

const NOT_FOUND = { error: "ไม่พบหน้านี้" };
const BAD_NEXT = { error: "next ต้องเป็น path ในแอป" };
const UNKNOWN_USER = { error: "ไม่พบผู้ใช้" };

/** Development only: signs this browser host in as a persona (the same demo sign-in as the persona picker) and opens `next`, so a link pressed in a /dev/channels pane opens as that pane's person. */
export function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json(NOT_FOUND, { status: 404 });
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const target = new URL(next, url.origin);
  if (safeNextPath(next) !== next || target.origin !== url.origin) return NextResponse.json(BAD_NEXT, { status: 400 });
  const signIn = demoSignIn(url.searchParams.get("user") ?? "");
  if (!signIn.ok) return signIn.reason === "off" ? NextResponse.json(NOT_FOUND, { status: 404 }) : NextResponse.json(UNKNOWN_USER, { status: 400 });
  const response = NextResponse.redirect(target);
  response.cookies.set(signIn.cookie);
  return response;
}
