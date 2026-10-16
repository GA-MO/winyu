import { describe, expect, test } from "bun:test";
import type { AuditEntry } from "@/lib/contracts";
import { MATTER_AUDIT_TOOL, SHARE_AUDIT_TOOL } from "./audit";
import { inAuditScope, type AuditFilter } from "./usage";

const AT = "2026-10-16T09:00:00.000Z";
const ACTIVITY: AuditFilter = { userId: null, tool: null, connector: null, decision: null, since: null, activity: true };

function row(id: string, tool: string, decision: AuditEntry["decision"] = "allow", code?: string): AuditEntry {
  return { id, at: AT, userId: "u_anucha", tool, argsHash: "x", decision, rowsReturned: 0, latencyMs: 0, ...(code ? { code } : {}) };
}

describe("the Audit tab's activity filter", () => {
  test("keeps the sends, the presses on a matter and the writes that ran, and drops reads, refusals and failed writes", () => {
    const rows = [
      row("send", SHARE_AUDIT_TOOL),
      row("pass-on", MATTER_AUDIT_TOOL),
      row("pin", "pin_widget"),
      row("permission", "set_permission"),
      row("read", "query_metric"),
      row("refused-press", MATTER_AUDIT_TOOL, "deny", "not_allowed"),
      row("unapproved-write", "pin_widget", "deny", "NOT_APPROVED"),
      row("failed-write", "send_card", "allow", "NO_CARD"),
    ];
    expect(rows.filter((entry) => inAuditScope(entry, ACTIVITY)).map((entry) => entry.id)).toEqual(["send", "pass-on", "pin", "permission"]);
    expect(rows.filter((entry) => inAuditScope(entry, { ...ACTIVITY, activity: false }))).toHaveLength(rows.length);
  });
});
