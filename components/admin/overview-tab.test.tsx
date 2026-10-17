import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { resetRoleOverrides, setMetricVisibility } from "@/lib/access/role-overrides";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { auditLog } from "@/lib/server/audit";
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

describe("recent denials on the overview", () => {
  test("name the reason in Thai, never a raw code or the English label (AI-225)", () => {
    const at = new Date().toISOString();
    auditLog().put({ id: "ai225-scope", at, userId: "u_anucha", tool: "query_metric", argsHash: "x", decision: "deny", rowsReturned: 0, latencyMs: 1, code: "PERMISSION_DENIED", reason: "คุณไม่มีสิทธิ์ดูข้อมูลของ ภาคใต้" });
    auditLog().put({ id: "ai225-odd", at, userId: "u_anucha", tool: "query_metric", argsHash: "y", decision: "deny", rowsReturned: 0, latencyMs: 1, code: "SOME_NEW_CODE", reason: "เหตุผลจากเครื่องมือ" });
    const html = renderToStaticMarkup(<OverviewTab />);
    expect(html).toContain(TH.adminAudit.codes.PERMISSION_DENIED ?? "missing");
    expect(html).toContain("เหตุผลจากเครื่องมือ");
    expect(html).not.toContain("Out of scope");
    expect(html).not.toContain("SOME_NEW_CODE");
  });
});
