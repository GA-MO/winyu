import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { accessFor } from "@/lib/access/policies";
import { permissionsFor } from "@/lib/access/role-overrides";
import { METRIC_IDS } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { auditLog, recordShare } from "@/lib/server/audit";
import { recordAction } from "@/lib/server/threads";
import { sinceDaysStart, toolCalls } from "@/lib/server/tool-activity";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { formatDateTh } from "@/lib/i18n/format";
import { bangkokDate, businessToday } from "@/lib/data/dates";
import { adminAuditTool } from "@/lib/server/tools/admin-audit";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { TOOL_CARDS } from "../registry";

type Report = { ok: boolean; summary: string; provenance: { asOf: string }; headline: { label: string; value: string } | null; rows: Record<string, unknown>[]; folded: { line: string; rows: Record<string, unknown>[] } | null };

async function adminAudit(input: Record<string, unknown>): Promise<Report> {
  const user = findUser("u_ton");
  if (!user) throw new Error("no u_ton");
  return runWithAccess(accessFor(user), () => winyuTools().admin_audit.execute({ days: null, role: null, ...input }) as Promise<Report>);
}

function drawn(result: Report): string {
  return renderToStaticMarkup(<>{TOOL_CARDS.admin_audit(result)}</>);
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
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

  test("Winyu's own operations are counted and stamped on the real date and labelled as system data, never on Winyu's business day", async () => {
    const realDay = formatDateTh(bangkokDate(new Date()));
    const result = await adminAudit({ topic: "model_cost", days: 7 });
    expect(result.summary.startsWith(TH.adminAudit.systemAsOf(realDay))).toBe(true);
    expect(result.provenance.asOf).toBe(bangkokDate(new Date()));
    expect(drawn(result)).toContain(TH.adminAudit.footnote(TH.adminAudit.source, realDay));
    expect(drawn(result)).not.toContain(formatDateTh(businessToday()));
  });

  test("every topic is a report: the tool tells the model never to offer wider access, not only for denials", () => {
    const description = adminAuditTool.description();
    expect(description).toContain("Every topic is a report");
    expect(description).toContain("Never offer or suggest opening, widening or loosening anyone's access");
  });

  test("role access draws only what the role may not see in full or call, the rest folded into one line", async () => {
    const result = await adminAudit({ topic: "role_access", role: "sales_rep" });
    const html = drawn(result);
    const shownFolded = (result.folded?.rows ?? []).filter((row) => html.includes(`>${String(row.key_label)}<`));
    expect(shownFolded).toEqual([]);
    expect(html).toContain(result.folded?.line ?? "missing");
    expect(result.rows.every((row) => html.includes(String(row.key_label)))).toBe(true);
  });

  test("activity reads at phone width: no table, each step 'who → whom' with the card's title (AI-148)", async () => {
    const title = "ยอดขายอีสานต่ำกว่าเป้า H5";
    recordShare({ userId: "u_thana", code: "h5-share", title, reads: ["query_metric"], deliveries: [{ userId: "u_anucha", asked: "web", via: "web", fallback: null }] });
    const html = drawn(await adminAudit({ topic: "activity", days: 1 }));
    expect(html).not.toContain("<table");
    expect(textOf(html)).toContain(`${nameOf("u_thana")} → ${nameOf("u_anucha")}`);
    expect(textOf(html)).toContain(title);
    expect(textOf(html)).toContain(TH.adminAudit.topic.activity);
  });

  test("a denial names the refused item and result in Thai, with no table, no raw key and no tool-argument JSON (AI-148, AI-160)", async () => {
    auditLog().put({
      id: "h5-denial",
      at: new Date().toISOString(),
      userId: "u_anucha",
      tool: "query_metric",
      connector: "semantic",
      argsHash: "h5",
      decision: "deny",
      rowsReturned: 0,
      latencyMs: 3,
      code: "PERMISSION_DENIED",
      reason: "คุณไม่มีสิทธิ์ดูข้อมูลของ ภาคใต้",
      args: JSON.stringify({ metric: "net_sales_value", filters: { region: ["south"] } }),
      initiator: "person",
    });
    const html = drawn(await adminAudit({ topic: "denials", days: 1 }));
    expect(html).not.toContain("<table");
    expect(html).not.toContain("policy_label");
    expect(html).not.toContain(TH.admin.auditTab.codes.PERMISSION_DENIED ?? "missing");
    expect(textOf(html)).not.toContain("&quot;metric&quot;");
    expect(textOf(html)).not.toContain('"metric"');
    expect(textOf(html)).toContain(metricLabel("net_sales_value"));
    expect(textOf(html)).toContain(nameOf("u_anucha"));
  });

  test("role access asked for one level returns only that level, so the card and the reply agree (AI-149)", async () => {
    const acl = permissionsFor("sales_rep").metricAcl;
    const masked = METRIC_IDS.filter((metric) => acl[metric] === "masked").map(metricLabel);
    expect(masked.length).toBeGreaterThan(0);
    const result = await adminAudit({ topic: "role_access", role: "sales_rep", level: "masked" });
    expect(result.rows.map((row) => String(row.key_label))).toEqual(masked);
    expect(result.summary).toContain(String(masked.length));
  });

  test("usage by person ranks who uses Winyu, counting questions and tool calls per person, never what they typed (AI-150)", async () => {
    const typed = "คำถามลับของคุณกฤต H5";
    recordAction("u_krit", "question", "", typed, null);
    recordAction("u_krit", "question", "", typed, null);
    const result = await adminAudit({ topic: "user_usage", days: 1 });
    expect(result.ok).toBe(true);
    const krit = result.rows.find((row) => row.user_name === nameOf("u_krit"));
    expect(krit?.role_label).toBe(TH.role.sales_rep);
    expect(Number(krit?.questions)).toBeGreaterThanOrEqual(2);
    const ranked = result.rows.map((row) => Number(row.questions));
    expect(ranked).toEqual([...ranked].sort((left, right) => right - left));
    const personCalls = toolCalls(auditLog().all(), sinceDaysStart(1)).filter((entry) => (entry.initiator ?? "person") === "person").length;
    expect(result.rows.reduce((sum, row) => sum + Number(row.calls), 0)).toBe(personCalls);
    expect(JSON.stringify(result)).not.toContain(typed);
    const html = drawn(result);
    expect(html).not.toContain("<table");
    expect(textOf(html)).toContain(nameOf("u_krit"));
  });
});
