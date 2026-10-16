import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { personaOf } from "@/lib/server/portraits";

mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

const { AccountSheet } = await import("./sheet");

describe("the account sheet", () => {
  test("offers signing out and no way to switch to another person", () => {
    const [user, ...others] = USERS;
    const html = renderToStaticMarkup(<AccountSheet open onClose={() => {}} user={personaOf(user)} />);
    expect(html).toContain(TH.account.signOut);
    expect(html).not.toContain("สลับผู้ใช้");
    for (const other of others) expect(html).not.toContain(other.nameTh);
  });
});
