import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { USERS } from "@/lib/data/entities/users";

const DEFAULT_PORT = 3296;
const TOKEN_LIFETIME_SECONDS = 3600;
const KEY_ID = "mock-entra-key";
const OUTSIDER = { oid: "0e0e0e0e-0000-4000-8000-00000000bad1", email: "guest.contractor@example.com", name: "Guest Contractor" };

/** A directory account the mock signs in: one per persona (same email as the persona) plus one outsider nobody maps. */
export type MockAccount = { oid: string; email: string; name: string };

/** `port` 0 picks a free port. */
export type EntraMockOptions = { port: number; tenantId: string; clientId: string; clientSecret: string };

type PendingCode = { account: MockAccount; nonce: string | null; challenge: string; redirectUri: string; clientId: string };

/** A stable object id per persona, so a link made today still matches after a restart. */
export function mockObjectId(userId: string): string {
  const hex = createHash("sha256").update(`mock-entra:${userId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const MOCK_ACCOUNTS: readonly MockAccount[] = [...USERS.map((user) => ({ oid: mockObjectId(user.id), email: user.email, name: user.name })), OUTSIDER];

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signJwt(claims: Record<string, unknown>, privateKey: KeyObject): string {
  const input = `${base64url(JSON.stringify({ alg: "RS256", kid: KEY_ID, typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  return `${input}.${base64url(sign("sha256", Buffer.from(input), privateKey))}`;
}

function clientOf(req: Request, form: URLSearchParams): { id: string | null; secret: string | null } {
  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(basic.slice("Basic ".length), "base64").toString("utf8").split(":").map(decodeURIComponent);
    return { id: id ?? null, secret: secret ?? null };
  }
  return { id: form.get("client_id"), secret: form.get("client_secret") };
}

function pickerPage(url: URL): Response {
  const rows = MOCK_ACCOUNTS.map((account) => {
    const target = new URL(url);
    target.searchParams.set("login_hint", account.oid);
    return `<li><a href="${target.href.replaceAll("&", "&amp;")}"><b>${account.name}</b><span>${account.email}</span></a></li>`;
  }).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Mock Microsoft sign-in</title><style>body{font:14px system-ui;background:#f3f2f1;margin:0;display:grid;place-items:center;min-height:100vh}main{background:#fff;padding:32px;width:420px;box-shadow:0 2px 6px #0002}h1{font-size:22px;font-weight:600;margin:0 0 4px}p{color:#605e5c;margin:0 0 16px}ul{list-style:none;padding:0;margin:0;max-height:60vh;overflow:auto}a{display:flex;flex-direction:column;padding:8px 10px;color:#1b1b1b;text-decoration:none;border-bottom:1px solid #edebe9}a:hover{background:#f3f2f1}span{color:#605e5c;font-size:12px}</style><main><h1>Pick an account</h1><p>Mock Microsoft Entra ID (development only)</p><ul>${rows}</ul></main>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Serves a local stand-in for Microsoft Entra ID v2.0 (discovery, authorize, token, keys, logout) under one tenant, for tests and the browser walk. */
export function startEntraMock(options: EntraMockOptions) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KEY_ID, use: "sig", alg: "RS256" };
  const codes = new Map<string, PendingCode>();
  const server = Bun.serve({ port: options.port, fetch: (req) => route(req) });
  const origin = `http://localhost:${server.port}`;
  const tenantRoot = `${origin}/${options.tenantId}`;
  const issuer = `${tenantRoot}/v2.0`;

  const discovery = {
    issuer,
    authorization_endpoint: `${tenantRoot}/oauth2/v2.0/authorize`,
    token_endpoint: `${tenantRoot}/oauth2/v2.0/token`,
    jwks_uri: `${tenantRoot}/discovery/v2.0/keys`,
    end_session_endpoint: `${tenantRoot}/oauth2/v2.0/logout`,
    response_types_supported: ["code", "id_token", "code id_token", "id_token token"],
    response_modes_supported: ["query", "fragment", "form_post"],
    subject_types_supported: ["pairwise"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "private_key_jwt", "client_secret_basic"],
    claims_supported: ["sub", "iss", "aud", "exp", "iat", "nonce", "name", "preferred_username", "email", "oid", "tid", "ver"],
    tenant_region_scope: "AS",
  };

  function authorize(url: URL): Response {
    const params = url.searchParams;
    if (params.get("client_id") !== options.clientId) return new Response("AADSTS700016: unknown client", { status: 400 });
    if (params.get("code_challenge_method") !== "S256" || !params.get("code_challenge")) return new Response("AADSTS501491: PKCE required", { status: 400 });
    const hint = params.get("login_hint");
    const account = MOCK_ACCOUNTS.find((candidate) => candidate.oid === hint || candidate.email === hint);
    if (!account) return pickerPage(url);
    const redirectUri = params.get("redirect_uri") ?? "";
    const code = base64url(randomBytes(24));
    codes.set(code, { account, nonce: params.get("nonce"), challenge: params.get("code_challenge") ?? "", redirectUri, clientId: options.clientId });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    const state = params.get("state");
    if (state) back.searchParams.set("state", state);
    return Response.redirect(back.href, 302);
  }

  async function token(req: Request): Promise<Response> {
    const form = new URLSearchParams(await req.text());
    const client = clientOf(req, form);
    if (client.id !== options.clientId || client.secret !== options.clientSecret) return Response.json({ error: "invalid_client" }, { status: 401 });
    const code = form.get("code") ?? "";
    const pending = codes.get(code);
    codes.delete(code);
    if (!pending || form.get("grant_type") !== "authorization_code") return Response.json({ error: "invalid_grant" }, { status: 400 });
    if (form.get("redirect_uri") !== pending.redirectUri) return Response.json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, { status: 400 });
    const verifier = form.get("code_verifier") ?? "";
    if (base64url(createHash("sha256").update(verifier).digest()) !== pending.challenge) return Response.json({ error: "invalid_grant", error_description: "PKCE mismatch" }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const idToken = signJwt(
      {
        ver: "2.0",
        iss: issuer,
        aud: options.clientId,
        sub: base64url(createHash("sha256").update(`${pending.account.oid}:${options.clientId}`).digest()).slice(0, 43),
        oid: pending.account.oid,
        tid: options.tenantId,
        name: pending.account.name,
        preferred_username: pending.account.email,
        email: pending.account.email,
        iat: now,
        nbf: now,
        exp: now + TOKEN_LIFETIME_SECONDS,
        ...(pending.nonce ? { nonce: pending.nonce } : {}),
      },
      privateKey,
    );
    return Response.json({ token_type: "Bearer", scope: "openid profile email", expires_in: TOKEN_LIFETIME_SECONDS, access_token: base64url(randomBytes(32)), id_token: idToken });
  }

  function logout(url: URL): Response {
    const back = url.searchParams.get("post_logout_redirect_uri");
    return back ? Response.redirect(back, 302) : new Response("You have signed out of the mock Microsoft account.");
  }

  function route(req: Request): Response | Promise<Response> {
    const url = new URL(req.url);
    switch (url.pathname) {
      case `/${options.tenantId}/v2.0/.well-known/openid-configuration`:
        return Response.json(discovery);
      case `/${options.tenantId}/discovery/v2.0/keys`:
        return Response.json({ keys: [jwk] });
      case `/${options.tenantId}/oauth2/v2.0/authorize`:
        return authorize(url);
      case `/${options.tenantId}/oauth2/v2.0/token`:
        return req.method === "POST" ? token(req) : new Response("method not allowed", { status: 405 });
      case `/${options.tenantId}/oauth2/v2.0/logout`:
        return logout(url);
      default:
        return new Response("not found", { status: 404 });
    }
  }

  return { authority: origin, issuer, stop: () => server.stop(true) };
}

if (import.meta.main) {
  const { ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_AUTHORITY } = process.env;
  if (!ENTRA_TENANT_ID || !ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET) {
    console.error("set ENTRA_TENANT_ID, ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET (the same values the app gets)");
    process.exit(1);
  }
  const port = ENTRA_AUTHORITY ? Number(new URL(ENTRA_AUTHORITY).port) : DEFAULT_PORT;
  const mock = startEntraMock({ port, tenantId: ENTRA_TENANT_ID, clientId: ENTRA_CLIENT_ID, clientSecret: ENTRA_CLIENT_SECRET });
  console.log(`mock Entra issuer ${mock.issuer} (set ENTRA_AUTHORITY=${mock.authority} on the app)`);
}
