import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { TOOL_CARDS } from "../registry";

type Report = { ok: boolean; summary: string; headline: { label: string; value: string } | null; rows: Record<string, unknown>[]; folded: { line: string; rows: Record<string, unknown>[] } | null };

async function adminAudit(input: Record<string, unknown>): Promise<Report> {
  const user = findUser("u_ton");
  if (!user) throw new Error("no u_ton");
  return runWithAccess(accessFor(user), () => winyuTools().admin_audit.execute({ days: null, role: null, ...input }) as Promise<Report>);
}

function drawn(result: Report): string {
  return renderToStaticMarkup(<>{TOOL_CARDS.admin_audit(result)}</>);
}

describe("the admin audit card", () => {
  test("model cost shows the total as the hero above the split by source", async () => {
    const result = await adminAudit({ topic: "model_cost", days: 7 });
    const html = drawn(result);
    const hero = html.indexOf(TH.adminAudit.costTotal(7));
    expect(hero).toBeGreaterThanOrEqual(0);
    expect(html.indexOf(result.headline?.value ?? "missing", hero)).toBeGreaterThan(hero);
    expect(html.indexOf(TH.adminAudit.sources.chat)).toBeGreaterThan(hero);
  });

  test("role access draws only what the role may not see in full or call, the rest folded into one line", async () => {
    const result = await adminAudit({ topic: "role_access", role: "sales_rep" });
    const html = drawn(result);
    const shownFolded = (result.folded?.rows ?? []).filter((row) => html.includes(`>${String(row.key_label)}<`));
    expect(shownFolded).toEqual([]);
    expect(html).toContain(result.folded?.line ?? "missing");
    expect(result.rows.every((row) => html.includes(String(row.key_label)))).toBe(true);
  });
});
