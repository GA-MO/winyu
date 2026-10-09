import { afterEach, describe, expect, test } from "bun:test";
import { sessionFromCookie } from "@/lib/server/auth/session-token";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";
import { GET } from "./route";

const ORIGIN = "http://127.0.0.1:3100";
const ENV = process.env as Record<string, string | undefined>;
const ORIGINAL = { mode: ENV.WINYU_AUTH, nodeEnv: ENV.NODE_ENV };

function open(user: string, next: string): Response {
  return GET(new Request(`${ORIGIN}/dev/as?${new URLSearchParams({ user, next }).toString()}`));
}

function sessionOf(response: Response) {
  const value = (response.headers.get("set-cookie") ?? "").match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))?.[1];
  return sessionFromCookie(value);
}

afterEach(() => {
  ENV.WINYU_AUTH = ORIGINAL.mode;
  ENV.NODE_ENV = ORIGINAL.nodeEnv;
  if (ORIGINAL.mode === undefined) delete ENV.WINYU_AUTH;
});

describe("/dev/as", () => {
  test("signs this host in as the persona and opens the path on the same host", () => {
    ENV.WINYU_AUTH = "demo";
    const response = open("u_krit", "/s/abc123?from=line");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/s/abc123?from=line`);
    expect(sessionOf(response)).toEqual({ via: "demo", userId: "u_krit" });
    expect(response.headers.get("set-cookie")?.toLowerCase()).not.toContain("domain=");
  });

  test.each(["//evil.com", "https://evil.com/s/x", "/\\evil.com", "/\t/evil.com", "s/abc"])("refuses %p as next and sets no cookie", (next) => {
    ENV.WINYU_AUTH = "demo";
    const response = open("u_krit", next);
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("an unknown persona is a bad request", () => {
    ENV.WINYU_AUTH = "demo";
    expect(open("u_nobody", "/").status).toBe(400);
  });

  test("does not exist in production, nor outside demo sign-in", () => {
    ENV.WINYU_AUTH = "demo";
    ENV.NODE_ENV = "production";
    expect(open("u_krit", "/").status).toBe(404);
    ENV.NODE_ENV = ORIGINAL.nodeEnv;
    ENV.WINYU_AUTH = "entra";
    const response = open("u_krit", "/");
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
