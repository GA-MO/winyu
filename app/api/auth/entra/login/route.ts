import { NextResponse, type NextRequest } from "next/server";
import { beginSignIn, entraConfig, transactionCookie } from "@/lib/server/auth/entra";
import { authMode } from "@/lib/server/auth/mode";
import { safeNextPath } from "@/lib/server/auth/next-path";

const NOT_FOUND = { error: "ไม่พบหน้านี้" };

export const runtime = "nodejs";

/** Sends the browser to Microsoft to sign in; absent (404) unless MASCOP_AUTH is entra. */
export async function GET(req: NextRequest) {
  if (authMode() !== "entra") return NextResponse.json(NOT_FOUND, { status: 404 });
  const config = entraConfig();
  if (!config) return NextResponse.redirect(new URL("/login?error=config", req.url));
  const { url, transaction } = await beginSignIn(config, safeNextPath(req.nextUrl.searchParams.get("next"))).catch((error: unknown) => {
    console.error("entra sign-in could not start", error);
    return { url: null, transaction: null };
  });
  if (!url) return NextResponse.redirect(new URL("/login?error=unreachable", config.redirectUri));
  const response = NextResponse.redirect(url);
  response.cookies.set(transactionCookie(transaction));
  return response;
}
