import { describe, expect, test } from "bun:test";
import type { AuditEntry } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { activitiesFrom } from "./activity";
import { MATTER_AUDIT_TOOL, SHARE_AUDIT_TOOL, auditLog } from "./audit";
import { applyPermissionChange } from "./permissions";
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

describe("a permission change made in chat", () => {
  test("is one activity naming the role, the item, and the old and new level, approved in chat (AI-151)", () => {
    const since = new Date(Date.now() - 1000).toISOString();
    const change = applyPermissionChange({ role: "sales_rsm", kind: "metric", key: "ar_overdue", value: "none" }, "u_ton");
    expect(change.ok).toBe(true);
    auditLog().put({ id: "h5-chat-permission", at: new Date(Date.now() + 5).toISOString(), userId: "u_ton", tool: "set_permission", connector: "winyu", argsHash: "h5", decision: "allow", rowsReturned: 0, latencyMs: 400, args: JSON.stringify({ role: "sales_rsm", kind: "metric", key: "ar_overdue", value: "none" }), initiator: "person" });
    const steps = activitiesFrom(auditLog().all(), since).filter((activity) => activity.actorId === "u_ton");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.subject).toContain(TH.role.sales_rsm);
    expect(steps[0]?.subject).toContain(metricLabel("ar_overdue"));
    expect(steps[0]?.subject).toContain(TH.adminAudit.visibility.none);
    expect(steps[0]?.approval).toEqual({ kind: "chat", approverId: "u_ton" });
  });
});
