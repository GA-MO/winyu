import type { NextRequest } from "next/server";
import { accountLinkUrl, lineSettings } from "@/lib/server/channels/line";
import { confirmLinkRequest } from "@/lib/server/channels/line-link";
import { readUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEE_OTHER = 303;

function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin;
}

/** The signed-in person confirms a LINE link request from the web page: the request is spent and they go on to LINE's account-link dialog, which reports back to the webhook with the nonce. A post from another site, or without a session, goes back to the page. */
export async function POST(request: NextRequest): Promise<Response> {
  const settings = lineSettings();
  const user = readUser(request.cookies);
  const token = String((await request.formData()).get("token") ?? "");
  const back = new URL(`/link/line/${encodeURIComponent(token)}`, request.url);
  if (!settings || !user || !sameOrigin(request)) return Response.redirect(back, SEE_OTHER);
  const nonce = confirmLinkRequest(token, user);
  return Response.redirect(nonce ? accountLinkUrl(settings, token, nonce) : back, SEE_OTHER);
}
