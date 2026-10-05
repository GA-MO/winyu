import { NextResponse, type NextRequest } from "next/server";
import { clearedTransactionCookie, deniedCookie, entraConfig, EntraSignInError, finishSignIn, TRANSACTION_COOKIE, transactionFromCookie } from "@/lib/server/auth/entra";
import { authMode } from "@/lib/server/auth/mode";
import { sessionCookie } from "@/lib/server/auth/session-token";
import { identityKey, linkedUser, noteUnlinkedAttempt, type ExternalIdentity } from "@/lib/server/identity";

const NOT_FOUND = { error: "ไม่พบหน้านี้" };
const NO_ACCESS_PATH = "/login/no-access";

/** Why a sign-in came back without an identity; the sign-in page explains each in Thai. */
export type SignInRefusal = "config" | "expired" | "cancelled" | "failed";

type Outcome = { identity: ExternalIdentity; next: string } | { refusal: SignInRefusal };

export const runtime = "nodejs";

async function outcomeOf(req: NextRequest): Promise<Outcome> {
  const config = entraConfig();
  if (!config) return { refusal: "config" };
  const transaction = transactionFromCookie(req.cookies.get(TRANSACTION_COOKIE)?.value);
  if (!transaction) return { refusal: "expired" };
  if (req.nextUrl.searchParams.has("error")) return { refusal: "cancelled" };
  try {
    return { identity: await finishSignIn(config, transaction, req.nextUrl.searchParams), next: transaction.next };
  } catch (error) {
    if (!(error instanceof EntraSignInError)) throw error;
    console.error("entra sign-in refused", error.message);
    return { refusal: "failed" };
  }
}

function responseFor(outcome: Outcome, base: URL): NextResponse {
  if ("refusal" in outcome) return NextResponse.redirect(new URL(`/login?error=${outcome.refusal}`, base));
  const { identity, next } = outcome;
  const user = linkedUser(identity);
  if (user) {
    const response = NextResponse.redirect(new URL(next, base));
    response.cookies.set(sessionCookie({ via: "entra", userId: user.id, identity: identityKey(identity) }));
    return response;
  }
  noteUnlinkedAttempt(identity, new Date().toISOString());
  const response = NextResponse.redirect(new URL(NO_ACCESS_PATH, base));
  response.cookies.set(deniedCookie({ name: identity.name, email: identity.email, objectId: identity.subject }));
  return response;
}

/** Where Microsoft returns the browser: a linked person gets a mascop session, anyone else the no-access page and a row for IT. */
export async function GET(req: NextRequest) {
  if (authMode() !== "entra") return NextResponse.json(NOT_FOUND, { status: 404 });
  const response = responseFor(await outcomeOf(req), entraConfig()?.redirectUri ?? new URL(req.url));
  response.cookies.set(clearedTransactionCookie());
  return response;
}
