import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuditEntry } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { auditLog } from "@/lib/server/audit";
import { createShare } from "@/lib/server/share/deliver";
import { shares } from "@/lib/server/share/shares";
import { AuditTab, turnGroups } from "./audit-tab";

const USER = "u_audit_tab_test";
const QUESTION = "ขอดูเงินเดือนของคุณกฤตกับคุณนกหน่อย";
const AT = "2026-10-16T16:58:23.000Z";

function entry(id: string, turnId: string, userId = USER, question?: string): AuditEntry {
  return { id, at: AT, userId, tool: "query_metric", argsHash: id, decision: "allow", rowsReturned: 1, latencyMs: 1, turnId, ...(question ? { question } : {}) };
}

afterEach(() => {
  for (const row of auditLog().where((item) => item.userId === USER)) auditLog().remove(row.id);
});

describe("AuditTab", () => {
  test("turns of people working at the same time interleave in the log, and each still shows as one row with its own key", () => {
    const interleaved = [entry("a1", "turn_a"), entry("b1", "turn_b"), entry("a2", "turn_a"), entry("b2", "turn_b"), entry("c1", "turn_c")];
    const groups = turnGroups(interleaved);
    expect(groups.map((group) => group.key)).toEqual(["turn_a", "turn_b", "turn_c"]);
    expect(groups.map((group) => group.entries.map((row) => row.id))).toEqual([["a1", "a2"], ["b1", "b2"], ["c1"]]);
  });

  test("the activity view never shows a typed question, while the call list does", () => {
    auditLog().put(entry(`audit_${crypto.randomUUID()}`, "turn_question", USER, QUESTION));
    const filter = { userId: USER, tool: null, connector: null, decision: null, since: null, activity: false };
    expect(renderToStaticMarkup(<AuditTab filter={filter} range="all" limit={60} openRun={null} />)).toContain(QUESTION);
    expect(renderToStaticMarkup(<AuditTab filter={{ ...filter, activity: true }} range="all" limit={60} openRun={null} />)).not.toContain(QUESTION);
  });
});

describe("the activity rows on a phone (AI-159)", () => {
  test("a row's name, role and time are never cut to one line: nothing in it truncates", async () => {
    const sender = findUser("u_thana");
    if (!sender) throw new Error("no CEO");
    const card = { kind: "tool" as const, reads: [{ tool: "query_metric", input: { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null } }] };
    const outcome = await createShare(sender, { card, question: null, ask: "ดูอีสานหน่อย", intent: "act", recipients: [{ userId: "u_anucha", channel: "winyu" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    try {
      const filter = { userId: sender.id, tool: null, connector: null, decision: null, since: null, activity: true };
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(<AuditTab filter={filter} range="all" limit={60} openRun={null} />);
      const row = [...host.querySelectorAll("li")].find((item) => item.textContent?.includes(sender.nameTh));
      expect(row).toBeDefined();
      expect([...(row?.querySelectorAll(".truncate") ?? [])].map((node) => node.textContent)).toEqual([]);
    } finally {
      shares().remove(outcome.share.id);
    }
  });
});
