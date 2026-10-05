import { NextResponse, type NextRequest } from "next/server";
import { entraConfig, entraSignOutUrl } from "@/lib/server/auth/entra";
import { authMode } from "@/lib/server/auth/mode";
import { clearedSessionCookie } from "@/lib/server/auth/session-token";

const NOT_FOUND = { error: "ไม่พบหน้านี้" };

export const runtime = "nodejs";

/** Ends the mascop session and the Microsoft one, then Microsoft returns the browser to the sign-in page. */
export async function GET(req: NextRequest) {
  if (authMode() !== "entra") return NextResponse.json(NOT_FOUND, { status: 404 });
  const config = entraConfig();
  const target = config ? await entraSignOutUrl(config).catch(() => null) : null;
  const response = NextResponse.redirect(target ?? new URL("/login", req.url));
  response.cookies.set(clearedSessionCookie());
  return response;
}
