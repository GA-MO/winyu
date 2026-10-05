const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
const KEYS_PATH = "/botframework/keys";
const CLOCK_TOLERANCE_SECONDS = 300;
const RS256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

type JwtHeader = { alg?: string; kid?: string };
type JwtClaims = { iss?: string; aud?: string; exp?: number; nbf?: number; serviceurl?: string };
type Jwks = { keys?: (JsonWebKey & { kid?: string })[] };

function decoded<T>(part: string | undefined): T | null {
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

async function keyOf(simulator: string, kid: string): Promise<CryptoKey | null> {
  const jwks = (await (await fetch(new URL(KEYS_PATH, simulator))).json()) as Jwks;
  const jwk = jwks.keys?.find((key) => key.kid === kid);
  return jwk ? crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"]) : null;
}

function claimsHold(claims: JwtClaims, appId: string, serviceUrl: unknown, now: number): boolean {
  if (claims.iss !== BOT_FRAMEWORK_ISSUER || claims.aud !== appId) return false;
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_TOLERANCE_SECONDS < now) return false;
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_TOLERANCE_SECONDS > now) return false;
  return typeof serviceUrl === "string" && claims.serviceurl === serviceUrl;
}

function serviceUrlOf(body: string): unknown {
  try {
    return (JSON.parse(body) as { serviceUrl?: unknown }).serviceUrl;
  } catch {
    return undefined;
  }
}

/** Development only: checks an inbound activity the way Microsoft's validator does (RS256 over a published key, Bot Framework issuer, audience = the bot's app id, unexpired, and the serviceurl claim matching the activity), but against the local simulator's keys instead of login.botframework.com. */
export function botFrameworkVerifier(simulator: string, appId: string) {
  return async (request: Request, body: string): Promise<boolean> => {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const [head, payload, signature] = token?.split(".") ?? [];
    const header = decoded<JwtHeader>(head);
    const claims = decoded<JwtClaims>(payload);
    if (!header?.kid || header.alg !== "RS256" || !claims || !signature) return false;
    if (!claimsHold(claims, appId, serviceUrlOf(body), Math.floor(Date.now() / 1000))) return false;
    const key = await keyOf(simulator, header.kid);
    if (!key) return false;
    return crypto.subtle.verify(RS256, key, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${head}.${payload}`));
  };
}
