import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuditEntry } from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
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
