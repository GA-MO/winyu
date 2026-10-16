import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { resetRoleOverrides, setMetricVisibility } from "@/lib/access/role-overrides";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { OverviewTab } from "./overview-tab";

const CONFIRM = TH.admin.confirm;

afterEach(() => {
  resetRoleOverrides();
});

function formsOf(html: string): string[] {
  return html.match(/<form[\s\S]*?<\/form>/g) ?? [];
}

describe("reverting a permission override", () => {
  test("คืนค่า only opens a confirmation that says what goes back and how many people it touches; only the confirm button submits", () => {
    setMetricVisibility("sales_rep", "net_sales_value", "masked", "u_ton");
    const people = USERS.filter((user) => user.role === "sales_rep").length;
    const html = renderToStaticMarkup(<OverviewTab />);
    const reverts = formsOf(html).filter((form) => form.includes('name="override"'));
    expect(reverts).toHaveLength(1);
    const [revert] = reverts;
    expect(revert).toContain(CONFIRM.yes);
    expect(revert).not.toContain(`>${TH.admin.overview.revert}<`);
    expect(revert).toContain(`มีผลกับ ${people} คนทันที`);
    const opener = html.slice(html.lastIndexOf("<details", html.indexOf(revert)), html.indexOf(revert));
    expect(opener).toContain(TH.admin.overview.revert);
    const resetAll = formsOf(html).find((form) => form.includes(CONFIRM.all(1, people)));
    expect(resetAll).toContain(CONFIRM.yes);
  });
});
