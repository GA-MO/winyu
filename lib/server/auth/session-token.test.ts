import { afterEach, describe, expect, test } from "bun:test";
import { identityKey, linkIdentity, unlinkIdentity, type ExternalIdentity } from "@/lib/server/identity";
import { readUser } from "@/lib/server/session";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";
import { sessionCookie, sessionFromCookie } from "./session-token";
import { openToken, sealToken } from "./signed-token";

const SECRET = "a".repeat(32);
const NOW = Date.parse("2026-10-05T09:00:00Z");
const HOUR = 60 * 60 * 1000;
const ORIGINAL_MODE = process.env.WINYU_AUTH;

function jar(value: string) {
  return { get: (name: string) => (name === SESSION_COOKIE ? { value } : undefined) };
}

function flipLastCharacter(token: string): string {
  return `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
}

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.WINYU_AUTH;
  else process.env.WINYU_AUTH = ORIGINAL_MODE;
});

describe("a signed token opens only as it was sealed", () => {
  test("round trip returns the data", () => {
    expect(openToken(sealToken("session", { userId: "u_ton" }, NOW + HOUR, SECRET), "session", SECRET, NOW)).toEqual({ userId: "u_ton" });
  });

  test("a changed payload, a changed signature, another key, another purpose or an expired token open to null", () => {
    const token = sealToken("session", { userId: "u_beam" }, NOW + HOUR, SECRET);
    const [version, , mac] = token.split(".");
    const forgedPayload = `${version}.${Buffer.from(JSON.stringify({ purpose: "session", exp: NOW + HOUR, data: { userId: "u_thana" } })).toString("base64url")}.${mac}`;
    expect(openToken(forgedPayload, "session", SECRET, NOW)).toBeNull();
    expect(openToken(flipLastCharacter(token), "session", SECRET, NOW)).toBeNull();
    expect(openToken(token, "session", "b".repeat(32), NOW)).toBeNull();
    expect(openToken(token, "oidc", SECRET, NOW)).toBeNull();
    expect(openToken(token, "session", SECRET, NOW + 2 * HOUR)).toBeNull();
  });
});

describe("the session cookie", () => {
  test("the old unsigned cookie, a bare user id, is refused in both modes", () => {
    process.env.WINYU_AUTH = "demo";
    expect(readUser(jar("u_thana"))).toBeNull();
    process.env.WINYU_AUTH = "entra";
    expect(readUser(jar("u_thana"))).toBeNull();
  });

  test("a demo session works in demo mode and is refused once SSO is on", () => {
    process.env.WINYU_AUTH = "demo";
    const cookie = sessionCookie({ via: "demo", userId: "u_thana" });
    expect(cookie.httpOnly).toBe(true);
    expect(readUser(jar(cookie.value))?.id).toBe("u_thana");
    process.env.WINYU_AUTH = "entra";
    expect(readUser(jar(cookie.value))).toBeNull();
  });

  test("an Entra session holds while the link holds and ends the moment IT unlinks the identity", () => {
    process.env.WINYU_AUTH = "entra";
    const person: ExternalIdentity = { provider: "entra", tenant: "t1", subject: `oid-session-${Date.now()}`, email: null, name: null };
    linkIdentity(person, "u_kanok", "u_ton", "2026-10-05T09:00:00Z");
    const cookie = sessionCookie({ via: "entra", userId: "u_kanok", identity: identityKey(person) });
    expect(readUser(jar(cookie.value))?.id).toBe("u_kanok");
    unlinkIdentity(identityKey(person));
    expect(readUser(jar(cookie.value))).toBeNull();
  });

  test("an Entra session whose identity IT moved to another user is refused", () => {
    process.env.WINYU_AUTH = "entra";
    const person: ExternalIdentity = { provider: "entra", tenant: "t1", subject: `oid-moved-${Date.now()}`, email: null, name: null };
    linkIdentity(person, "u_kanok", "u_ton", "2026-10-05T09:00:00Z");
    const cookie = sessionCookie({ via: "entra", userId: "u_kanok", identity: identityKey(person) });
    linkIdentity(person, "u_beam", "u_ton", "2026-10-05T10:00:00Z");
    expect(readUser(jar(cookie.value))).toBeNull();
  });

  test("an expired session is refused", () => {
    process.env.WINYU_AUTH = "demo";
    const cookie = sessionCookie({ via: "demo", userId: "u_thana" }, NOW - 31 * 24 * HOUR);
    expect(sessionFromCookie(cookie.value, NOW)).toBeNull();
  });
});
