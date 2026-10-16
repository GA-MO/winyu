import { afterEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { ROLE_IDS } from "@/lib/contracts";
import { DEMO_PATH } from "@/components/login/demo-path";

mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { default: LoginPage } = await import("./page");

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

  test("demo mode keeps the persona picker", async () => {
    process.env.WINYU_AUTH = "demo";
    const html = await render({});
    expect(html).toContain(TH.login.demoPath.title);
    expect(html).not.toContain(TH.sso.signIn);
  });
});

describe("the demo path on the sign-in front", () => {
  test("every seat on the path is a real user", () => {
    const ids = new Set(USERS.map((user) => user.id));
    for (const seat of DEMO_PATH) expect(ids.has(seat.userId)).toBe(true);
  });

  test("the four seats render in path order, each with its role headline, its name and its cue", async () => {
    process.env.WINYU_AUTH = "demo";
    const html = await render({});
    const seats = DEMO_PATH.map((seat) => ({ ...seat, user: USERS.find((user) => user.id === seat.userId) }));
    expect(seats.map((seat) => seat.user?.role)).toEqual(["ceo", "sales_rsm", "sales_rep", "it_admin"]);
    const positions = seats.map((seat) => html.indexOf(`${TH.login.pick} ${seat.user?.title} ${seat.user?.nameTh}`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const [index, seat] of seats.entries()) {
      const card = html.slice(positions[index], positions[index + 1] ?? undefined);
      expect(card).toContain(seat.cue);
      expect(card).toContain(seat.user?.nameTh ?? "");
    }
  });

  test("every role stays one click away inside a collapsed disclosure", async () => {
    process.env.WINYU_AUTH = "demo";
    const html = await render({});
    const disclosure = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(html).not.toContain("<details open");
    expect(disclosure).toContain(TH.login.demoPath.allRoles(ROLE_IDS.length));
    for (const role of ROLE_IDS) expect(disclosure).toContain(`href="/login?role=${role}"`);
    expect(html).not.toContain(TH.login.stepRole);
  });

  test("picking a role still leads to that role's people with the steps shown", async () => {
    process.env.WINYU_AUTH = "demo";
    const html = await render({ role: "sales_rep" });
    expect(html).toContain(TH.login.stepPerson);
    expect(html).not.toContain(TH.login.demoPath.title);
    for (const user of USERS.filter((person) => person.role === "sales_rep")) expect(html).toContain(user.nameTh);
  });
});
