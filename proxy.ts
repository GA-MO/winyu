import { NextResponse, type NextRequest } from "next/server";
import { clearedSessionCookie, sessionFromCookie } from "@/lib/server/auth/session-token";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";

const PUBLIC_PATHS = ["/login", "/api/session", "/api/auth", "/api/health", "/api/mcp"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function refused(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export function proxy(req: NextRequest) {
  if (isPublic(req.nextUrl.pathname)) return NextResponse.next();
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (sessionFromCookie(cookie)) return NextResponse.next();
  const response = refused(req);
  if (cookie) response.cookies.set(clearedSessionCookie());
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp|txt|woff2?)$).*)"],
};
