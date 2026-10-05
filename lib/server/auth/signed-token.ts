import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

type Envelope = { purpose: string; exp: number; data: unknown };

function macOf(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

function envelopeOf(encoded: string): Envelope | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { purpose, exp, data } = value as Record<string, unknown>;
    return typeof purpose === "string" && typeof exp === "number" ? { purpose, exp, data } : null;
  } catch {
    return null;
  }
}

/** Seals `data` for one purpose until `expiresAt` (epoch ms) under an HMAC-SHA256 of the whole body. */
export function sealToken(purpose: string, data: unknown, expiresAt: number, secret: string): string {
  const body = `${VERSION}.${Buffer.from(JSON.stringify({ purpose, exp: expiresAt, data })).toString("base64url")}`;
  return `${body}.${macOf(body, secret).toString("base64url")}`;
}

/** The sealed data when the token is intact, unexpired at `now` and sealed for `purpose`; null otherwise. */
export function openToken(token: string, purpose: string, secret: string, now: number): unknown {
  const [version, encoded, mac, ...rest] = token.split(".");
  if (version !== VERSION || !encoded || !mac || rest.length > 0) return null;
  const given = Buffer.from(mac, "base64url");
  const expected = macOf(`${version}.${encoded}`, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const envelope = envelopeOf(encoded);
  if (!envelope || envelope.purpose !== purpose || envelope.exp <= now) return null;
  return envelope.data;
}
