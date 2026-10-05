import { afterEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { sessionCookie } from "@/lib/server/auth/session-token";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";
import { proxy } from "./proxy";

const ORIGINAL_MODE = process.env.WINYU_AUTH;

function request(path: string, cookie: string | null) {
  return new NextRequest(`http://localhost:3100${path}`, { headers: cookie === null ? {} : { cookie: `${SESSION_COOKIE}=${cookie}` } });
}

function passedThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.WINYU_AUTH;
  else process.env.WINYU_AUTH = ORIGINAL_MODE;
});

describe("the proxy lets through only a session this server signed", () => {
  test("a valid session passes to pages and APIs", () => {
    process.env.WINYU_AUTH = "demo";
    const value = sessionCookie({ via: "demo", userId: "u_beam" }).value;
    expect(passedThrough(proxy(request("/", value)))).toBe(true);
    expect(passedThrough(proxy(request("/api/copilotkit", value)))).toBe(true);
  });

  test("a tampered session is sent to sign-in and its cookie cleared", () => {
    process.env.WINYU_AUTH = "demo";
    const value = sessionCookie({ via: "demo", userId: "u_beam" }).value;
    const tampered = `${value.slice(0, -2)}xx`;
    const page = proxy(request("/dashboard", tampered));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost:3100/login?next=%2Fdashboard");
    expect(page.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
    expect(proxy(request("/api/copilotkit", tampered)).status).toBe(401);
  });

  test("a bare user id, the old demo cookie, is refused when SSO is on", () => {
    process.env.WINYU_AUTH = "entra";
    expect(proxy(request("/api/copilotkit", "u_thana")).status).toBe(401);
  });

  test("sign-in routes stay public", () => {
    process.env.WINYU_AUTH = "entra";
    expect(passedThrough(proxy(request("/login", null)))).toBe(true);
    expect(passedThrough(proxy(request("/api/auth/entra/callback", null)))).toBe(true);
  });
});
