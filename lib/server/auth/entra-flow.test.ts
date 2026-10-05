import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET as callback } from "@/app/api/auth/entra/callback/route";
import { GET as login } from "@/app/api/auth/entra/login/route";
import { GET as logout } from "@/app/api/auth/entra/logout/route";
import { identityKey, linkIdentity, pendingAttempt } from "@/lib/server/identity";
import { readUser } from "@/lib/server/session";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";
import { MOCK_ACCOUNTS, mockObjectId, startEntraMock, type MockAccount } from "@/scripts/entra-mock";
import { DENIED_COOKIE, deniedFromCookie, TRANSACTION_COOKIE } from "./entra";
import { sessionFromCookie } from "./session-token";

const TENANT = "11111111-2222-4333-8444-555555555555";
const CLIENT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SECRET = "mock-client-secret";
const APP = "http://localhost:3213";
const ENV_KEYS = ["WINYU_AUTH", "ENTRA_TENANT_ID", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET", "ENTRA_REDIRECT_URI", "ENTRA_AUTHORITY"] as const;
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const mock = startEntraMock({ port: 0, tenantId: TENANT, clientId: CLIENT, clientSecret: SECRET });

function accountOf(userId: string): MockAccount {
  const account = MOCK_ACCOUNTS.find((candidate) => candidate.oid === mockObjectId(userId));
  if (!account) throw new Error(`no mock account for ${userId}`);
  return account;
}

const OUTSIDER = MOCK_ACCOUNTS[MOCK_ACCOUNTS.length - 1];

function cookieOf(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`))?.split(";")[0].slice(name.length + 1);
}

async function leaveForMicrosoft(next = "/dashboard") {
  const response = await login(new NextRequest(`${APP}/api/auth/entra/login?next=${encodeURIComponent(next)}`));
  return { response, authorizeUrl: new URL(response.headers.get("location") ?? ""), transaction: cookieOf(response, TRANSACTION_COOKIE) ?? "" };
}

async function codeFromMicrosoft(authorizeUrl: URL, account: MockAccount): Promise<URL> {
  const pick = new URL(authorizeUrl);
  pick.searchParams.set("login_hint", account.oid);
  const response = await fetch(pick, { redirect: "manual" });
  return new URL(response.headers.get("location") ?? "");
}

function comeBack(callbackUrl: URL, transaction: string | null) {
  return callback(new NextRequest(callbackUrl, { headers: transaction === null ? {} : { cookie: `${TRANSACTION_COOKIE}=${transaction}` } }));
}

async function signInAs(account: MockAccount) {
  const { authorizeUrl, transaction } = await leaveForMicrosoft();
  return comeBack(await codeFromMicrosoft(authorizeUrl, account), transaction);
}

beforeAll(() => {
  Object.assign(process.env, { WINYU_AUTH: "entra", ENTRA_TENANT_ID: TENANT, ENTRA_CLIENT_ID: CLIENT, ENTRA_CLIENT_SECRET: SECRET, ENTRA_REDIRECT_URI: `${APP}/api/auth/entra/callback`, ENTRA_AUTHORITY: mock.authority });
});

afterEach(() => {
  process.env.WINYU_AUTH = "entra";
});

afterAll(() => {
  mock.stop();
  for (const key of ENV_KEYS) {
    if (ORIGINAL[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL[key];
  }
});

describe("signing in through an Entra-shaped issuer", () => {
  test("sign-in leaves for the tenant's authorize endpoint with PKCE, state and nonce", async () => {
    const { response, authorizeUrl, transaction } = await leaveForMicrosoft();
    expect(response.status).toBe(307);
    expect(authorizeUrl.href.startsWith(`${mock.authority}/${TENANT}/oauth2/v2.0/authorize`)).toBe(true);
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizeUrl.searchParams.get("scope")).toBe("openid profile email");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(`${APP}/api/auth/entra/callback`);
    expect(authorizeUrl.searchParams.get("state")).toBeTruthy();
    expect(authorizeUrl.searchParams.get("nonce")).toBeTruthy();
    expect(transaction.length).toBeGreaterThan(0);
  });

  test("a person IT linked lands where they were going, signed in as their persona", async () => {
    const account = accountOf("u_kanok");
    linkIdentity({ provider: "entra", tenant: TENANT, subject: account.oid, email: account.email, name: account.name }, "u_kanok", "u_ton", "2026-10-05T09:00:00Z");
    const response = await signInAs(account);
    expect(response.headers.get("location")).toBe(`${APP}/dashboard`);
    const session = cookieOf(response, SESSION_COOKIE) ?? "";
    expect(sessionFromCookie(session)).toEqual({ via: "entra", userId: "u_kanok", identity: identityKey({ provider: "entra", tenant: TENANT, subject: account.oid }) });
    expect(readUser({ get: (name) => (name === SESSION_COOKIE ? { value: session } : undefined) })?.id).toBe("u_kanok");
  });

  test("a person nobody linked gets the no-access page, no session, and a row for IT", async () => {
    const response = await signInAs(OUTSIDER);
    expect(response.headers.get("location")).toBe(`${APP}/login/no-access`);
    expect(cookieOf(response, SESSION_COOKIE)).toBeUndefined();
    expect(deniedFromCookie(cookieOf(response, DENIED_COOKIE))).toEqual({ name: OUTSIDER.name, email: OUTSIDER.email, objectId: OUTSIDER.oid });
    expect(pendingAttempt(identityKey({ provider: "entra", tenant: TENANT, subject: OUTSIDER.oid }))).toMatchObject({ email: OUTSIDER.email });
  });

  test("a callback whose state was changed is refused", async () => {
    const { authorizeUrl, transaction } = await leaveForMicrosoft();
    const callbackUrl = await codeFromMicrosoft(authorizeUrl, accountOf("u_kanok"));
    callbackUrl.searchParams.set("state", "forged");
    const response = await comeBack(callbackUrl, transaction);
    expect(response.headers.get("location")).toBe(`${APP}/login?error=failed`);
    expect(cookieOf(response, SESSION_COOKIE)).toBeUndefined();
  });

  test("a callback without the browser's transaction cookie is refused", async () => {
    const { authorizeUrl } = await leaveForMicrosoft();
    const response = await comeBack(await codeFromMicrosoft(authorizeUrl, accountOf("u_kanok")), null);
    expect(response.headers.get("location")).toBe(`${APP}/login?error=expired`);
    expect(cookieOf(response, SESSION_COOKIE)).toBeUndefined();
  });

  test("a code cannot be redeemed twice", async () => {
    const { authorizeUrl, transaction } = await leaveForMicrosoft();
    const callbackUrl = await codeFromMicrosoft(authorizeUrl, accountOf("u_kanok"));
    await comeBack(callbackUrl, transaction);
    const replay = await comeBack(callbackUrl, transaction);
    expect(replay.headers.get("location")).toBe(`${APP}/login?error=failed`);
  });

  test("sign-out clears the session and goes through Microsoft's logout back to sign-in", async () => {
    const response = await logout(new NextRequest(`${APP}/api/auth/entra/logout`));
    const target = new URL(response.headers.get("location") ?? "");
    expect(target.href.startsWith(`${mock.authority}/${TENANT}/oauth2/v2.0/logout`)).toBe(true);
    expect(target.searchParams.get("post_logout_redirect_uri")).toBe(`${APP}/login`);
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
  });

  test("the Entra routes do not exist in demo mode", async () => {
    process.env.WINYU_AUTH = "demo";
    expect((await login(new NextRequest(`${APP}/api/auth/entra/login`))).status).toBe(404);
    expect((await callback(new NextRequest(`${APP}/api/auth/entra/callback?code=x&state=y`))).status).toBe(404);
  });
});
