import { afterEach, describe, expect, test } from "bun:test";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";
import { sessionFromCookie } from "@/lib/server/auth/session-token";
import { DELETE, POST } from "./route";

const ORIGINAL_MODE = process.env.MASCOP_AUTH;

function signIn(userId: string) {
  return POST(new Request("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) }));
}

function sessionValueOf(response: Response): string | undefined {
  const header = response.headers.get("set-cookie") ?? "";
  return header.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))?.[1];
}

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.MASCOP_AUTH;
  else process.env.MASCOP_AUTH = ORIGINAL_MODE;
});

describe("demo persona sign-in", () => {
  test("in demo mode it signs the persona in with a signed session", async () => {
    process.env.MASCOP_AUTH = "demo";
    const response = await signIn("u_thana");
    expect(response.status).toBe(200);
    expect(sessionFromCookie(sessionValueOf(response))).toEqual({ via: "demo", userId: "u_thana" });
  });

  test("in entra mode it does not exist and sets no cookie", async () => {
    process.env.MASCOP_AUTH = "entra";
    const response = await signIn("u_thana");
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("sign-out clears the cookie in entra mode too", async () => {
    process.env.MASCOP_AUTH = "entra";
    const response = await DELETE();
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
  });
});
