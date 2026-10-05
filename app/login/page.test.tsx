import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import LoginPage from "./page";

const ORIGINAL_MODE = process.env.WINYU_AUTH;

async function render(params: Record<string, string>): Promise<string> {
  return renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }));
}

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.WINYU_AUTH;
  else process.env.WINYU_AUTH = ORIGINAL_MODE;
});

describe("the sign-in page in entra mode", () => {
  test("asking for a role still shows only the Microsoft button and nobody from the persona picker", async () => {
    process.env.WINYU_AUTH = "entra";
    const html = await render({ role: "ceo", next: "/dashboard" });
    expect(html).toContain(TH.sso.signIn);
    expect(html).toContain('href="/api/auth/entra/login?next=%2Fdashboard"');
    expect(html).not.toContain(TH.login.stepPerson);
    for (const user of USERS.filter((person) => person.role === "ceo")) expect(html).not.toContain(user.nameTh);
  });

  test("after signing out it offers the Microsoft sign-out, and a crafted next path cannot leave the app", async () => {
    process.env.WINYU_AUTH = "entra";
    const html = await render({ signedOut: "1", next: "//evil.example" });
    expect(html).toContain(TH.sso.signOutMicrosoft);
    expect(html).toContain('href="/api/auth/entra/login"');
  });

  test("a refusal reason from the callback is explained", async () => {
    process.env.WINYU_AUTH = "entra";
    expect(await render({ error: "expired" })).toContain(TH.sso.errors.expired);
    expect(await render({ error: "toString" })).not.toContain('role="alert"');
  });

  test("demo mode keeps the role picker", async () => {
    process.env.WINYU_AUTH = "demo";
    const html = await render({});
    expect(html).toContain(TH.login.stepRole);
    expect(html).not.toContain(TH.sso.signIn);
  });
});
