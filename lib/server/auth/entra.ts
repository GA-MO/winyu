import * as oidc from "openid-client";
import type { ExternalIdentity } from "@/lib/server/identity";
import { sessionSecret } from "./secret";
import { openToken, sealToken } from "./signed-token";

const DEFAULT_AUTHORITY = "https://login.microsoftonline.com";
const SCOPES = "openid profile email";
const TRANSACTION_COOKIE = "mascop_oidc";
const TRANSACTION_PURPOSE = "oidc";
const TRANSACTION_PATH = "/api/auth/entra";
const TRANSACTION_MAX_AGE_SECONDS = 10 * 60;
const DENIED_COOKIE = "mascop_denied";
const DENIED_PURPOSE = "denied";
const DENIED_MAX_AGE_SECONDS = 15 * 60;
const MS_PER_SECOND = 1000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const SIGNED_OUT_PATH = "/login?signedOut=1";

export const ENTRA_SETTINGS = ["ENTRA_TENANT_ID", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET", "ENTRA_REDIRECT_URI"] as const;

/** The app registration mascop signs people in with; `authority` is Microsoft's login host, or a local mock in development. */
export type EntraConfig = { tenantId: string; clientId: string; clientSecret: string; redirectUri: URL; authority: URL };

/** What the browser carries between leaving for Microsoft and coming back: the CSRF state, the ID token nonce, the PKCE verifier, and where to land. */
export type SignInTransaction = { state: string; nonce: string; verifier: string; next: string };

/** What an unlinked person sees on the no-access page so they can tell IT who they are. */
export type DeniedSignIn = { name: string | null; email: string | null; objectId: string };

export class EntraSignInError extends Error {}

export function missingEntraSettings(): string[] {
  return ENTRA_SETTINGS.filter((name) => !process.env[name]);
}

/** The directory people sign in from, which a pre-made link needs even before the rest of the registration is set. */
export function configuredTenantId(): string | null {
  return process.env.ENTRA_TENANT_ID || null;
}

/** The registration from the environment, or null while any ENTRA_* setting is missing or ENTRA_REDIRECT_URI is not a URL. */
export function entraConfig(): EntraConfig | null {
  const { ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_REDIRECT_URI, ENTRA_AUTHORITY } = process.env;
  if (!ENTRA_TENANT_ID || !ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET || !ENTRA_REDIRECT_URI) return null;
  if (!URL.canParse(ENTRA_REDIRECT_URI)) return null;
  return { tenantId: ENTRA_TENANT_ID, clientId: ENTRA_CLIENT_ID, clientSecret: ENTRA_CLIENT_SECRET, redirectUri: new URL(ENTRA_REDIRECT_URI), authority: new URL(ENTRA_AUTHORITY ?? DEFAULT_AUTHORITY) };
}

/** The v2.0 issuer of a single tenant, the shape Entra puts in `iss`. */
export function entraIssuer(config: EntraConfig): URL {
  return new URL(`${config.authority.origin}/${config.tenantId}/v2.0`);
}

let discovered: { key: string; configuration: Promise<oidc.Configuration> } | null = null;

function discover(config: EntraConfig): Promise<oidc.Configuration> {
  const issuer = entraIssuer(config);
  const key = `${issuer.href}|${config.clientId}`;
  if (discovered?.key === key) return discovered.configuration;
  const insecure = issuer.protocol === "http:" && LOCAL_HOSTS.has(issuer.hostname);
  const configuration = oidc.discovery(issuer, config.clientId, config.clientSecret, undefined, insecure ? { execute: [oidc.allowInsecureRequests] } : undefined);
  discovered = { key, configuration };
  configuration.catch(() => {
    if (discovered?.key === key) discovered = null;
  });
  return configuration;
}

/** The Microsoft sign-in URL (authorization code with PKCE) and the transaction to keep until the browser comes back. */
export async function beginSignIn(config: EntraConfig, next: string): Promise<{ url: URL; transaction: SignInTransaction }> {
  const configuration = await discover(config);
  const transaction: SignInTransaction = { state: oidc.randomState(), nonce: oidc.randomNonce(), verifier: oidc.randomPKCECodeVerifier(), next };
  const url = oidc.buildAuthorizationUrl(configuration, {
    redirect_uri: config.redirectUri.href,
    scope: SCOPES,
    response_mode: "query",
    code_challenge: await oidc.calculatePKCECodeChallenge(transaction.verifier),
    code_challenge_method: "S256",
    state: transaction.state,
    nonce: transaction.nonce,
  });
  return { url, transaction };
}

function claimText(claims: oidc.IDToken, name: string): string | null {
  const value = claims[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Redeems the code Microsoft sent back, checks state, nonce, PKCE, issuer, audience and tenant, and returns who signed in; throws EntraSignInError otherwise. */
export async function finishSignIn(config: EntraConfig, transaction: SignInTransaction, callbackParams: URLSearchParams): Promise<ExternalIdentity> {
  const configuration = await discover(config);
  const currentUrl = new URL(config.redirectUri);
  currentUrl.search = callbackParams.toString();
  const tokens = await oidc
    .authorizationCodeGrant(configuration, currentUrl, { pkceCodeVerifier: transaction.verifier, expectedState: transaction.state, expectedNonce: transaction.nonce, idTokenExpected: true })
    .catch((error: unknown) => {
      throw new EntraSignInError(error instanceof Error ? error.message : String(error));
    });
  const claims = tokens.claims();
  if (!claims) throw new EntraSignInError("no ID token");
  const objectId = claimText(claims, "oid");
  if (!objectId) throw new EntraSignInError("ID token has no oid; the app registration must allow the profile scope");
  if (claimText(claims, "tid") !== config.tenantId) throw new EntraSignInError("ID token is from another tenant");
  return { provider: "entra", tenant: config.tenantId, subject: objectId, email: claimText(claims, "email") ?? claimText(claims, "preferred_username"), name: claimText(claims, "name") };
}

/** Microsoft's sign-out URL, which returns the browser to mascop's sign-in page. */
export async function entraSignOutUrl(config: EntraConfig): Promise<URL> {
  const configuration = await discover(config);
  return oidc.buildEndSessionUrl(configuration, { post_logout_redirect_uri: new URL(SIGNED_OUT_PATH, config.redirectUri).href });
}

function transactionOf(data: unknown): SignInTransaction | null {
  if (typeof data !== "object" || data === null) return null;
  const { state, nonce, verifier, next } = data as Record<string, unknown>;
  return typeof state === "string" && typeof nonce === "string" && typeof verifier === "string" && typeof next === "string" ? { state, nonce, verifier, next } : null;
}

function deniedOf(data: unknown): DeniedSignIn | null {
  if (typeof data !== "object" || data === null) return null;
  const { name, email, objectId } = data as Record<string, unknown>;
  if (typeof objectId !== "string") return null;
  return { objectId, name: typeof name === "string" ? name : null, email: typeof email === "string" ? email : null };
}

function shortCookie(name: string, value: string, maxAge: number, path: string) {
  return { name, value, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path, maxAge };
}

export function transactionCookie(transaction: SignInTransaction, now = Date.now()) {
  return shortCookie(TRANSACTION_COOKIE, sealToken(TRANSACTION_PURPOSE, transaction, now + TRANSACTION_MAX_AGE_SECONDS * MS_PER_SECOND, sessionSecret()), TRANSACTION_MAX_AGE_SECONDS, TRANSACTION_PATH);
}

export function clearedTransactionCookie() {
  return shortCookie(TRANSACTION_COOKIE, "", 0, TRANSACTION_PATH);
}

export function transactionFromCookie(value: string | undefined, now = Date.now()): SignInTransaction | null {
  return value ? transactionOf(openToken(value, TRANSACTION_PURPOSE, sessionSecret(), now)) : null;
}

export function deniedCookie(denied: DeniedSignIn, now = Date.now()) {
  return shortCookie(DENIED_COOKIE, sealToken(DENIED_PURPOSE, denied, now + DENIED_MAX_AGE_SECONDS * MS_PER_SECOND, sessionSecret()), DENIED_MAX_AGE_SECONDS, "/");
}

export function deniedFromCookie(value: string | undefined, now = Date.now()): DeniedSignIn | null {
  return value ? deniedOf(openToken(value, DENIED_PURPOSE, sessionSecret(), now)) : null;
}

export { DENIED_COOKIE, TRANSACTION_COOKIE };
