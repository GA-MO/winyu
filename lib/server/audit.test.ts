import { describe, expect, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { liveAccessFor } from "@/lib/access/enforce";
import { gated } from "@/lib/harness/gateway";
import type { AuditEntry } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { toolLabel, winyuTool } from "@/lib/server/tools/registry";
import { auditLog, COMPOSED_CARD_AUDIT_TOOL, CONNECTOR_ADMIN_AUDIT_TOOL, GRANT_AUDIT_TOOL, GUARD_AUDIT_TOOL, MATTER_AUDIT_TOOL, recordMatterEvent, SHARE_AUDIT_TOOL } from "./audit";
import { runWithAccess, runWithTurn } from "./request-context";
import { toolActivity } from "./tool-activity";
import { sinceOf } from "./usage";

const PSEUDO_TOOLS = [COMPOSED_CARD_AUDIT_TOOL, SHARE_AUDIT_TOOL, MATTER_AUDIT_TOOL, GUARD_AUDIT_TOOL, CONNECTOR_ADMIN_AUDIT_TOOL, GRANT_AUDIT_TOOL];

const TURN = { turnId: "turn-audit-test", threadId: "thread-audit-test", preloadPacketId: null, question: "ยอดขายภาคใต้เท่าไหร่", queries: [] };

function krit() {
  const user = findUser("u_krit");
  if (!user) throw new Error("missing u_krit");
  return liveAccessFor(user);
}

const QUERY_METRIC = winyuTool("query_metric")?.capability;

async function audited(execute: (args: unknown) => Promise<unknown>, args: unknown) {
  if (!QUERY_METRIC) throw new Error("query_metric is off the surface");
  const before = new Set(auditLog().all().map((row) => row.id));
  await runWithAccess(krit(), () => runWithTurn(TURN, () => gated(QUERY_METRIC, execute)(args))).catch(() => undefined);
  const rows = auditLog().all().filter((row) => !before.has(row.id));
  for (const row of rows) auditLog().remove(row.id);
  return rows;
}

describe("the gateway audit", () => {
  test("a refusal keeps its code, its reason, the question and the turn it came from", async () => {
    const [row] = await audited(async () => ({ ok: false, code: "PERMISSION_DENIED", error: "บทบาทของคุณไม่มีสิทธิ์ดูภาคใต้" }), { region: "south" });
    expect([row.decision, row.code, row.reason, row.question, row.turnId, row.threadId]).toEqual([
      "deny",
      "PERMISSION_DENIED",
      "บทบาทของคุณไม่มีสิทธิ์ดูภาคใต้",
      TURN.question,
      TURN.turnId,
      TURN.threadId,
    ]);
    expect(row.args).toBe('{"region":"south"}');
  });

  test("a throw is recorded as a denied ERROR with its message, and long arguments are cut short", async () => {
    const [row] = await audited(async () => {
      throw new Error("warehouse down");
    }, { body: "ก".repeat(500) });
    expect([row.decision, row.code, row.reason]).toEqual(["deny", "ERROR", "warehouse down"]);
    expect((row.args ?? "").length).toBeLessThan(120);
  });
});

describe("audit ranges and activity", () => {
  test("today starts at midnight UTC, all time has no start", () => {
    expect(sinceOf("today", Date.parse("2026-09-24T15:00:00Z"))).toBe("2026-09-24T00:00:00.000Z");
    expect(sinceOf("7d", Date.parse("2026-09-24T15:00:00Z"))).toBe("2026-09-17T00:00:00.000Z");
    expect(sinceOf("all")).toBeNull();
  });

  test("activity counts tool calls and the ones refused, failed or masked, never the rows audited beside them", () => {
    const stamp = new Date().toISOString();
    const entry = (id: string, tool: string, decision: AuditEntry["decision"]): AuditEntry => ({ id, at: stamp, userId: "u_krit", tool, argsHash: "x", decision, rowsReturned: 0, latencyMs: 1 });
    const rows = [
      entry("activity-allow", "get_calendar", "allow"),
      entry("activity-deny", "get_calendar", "deny"),
      entry("activity-masked", "get_calendar", "masked"),
      ...PSEUDO_TOOLS.map((tool) => entry(`activity-${tool}`, tool, "deny")),
    ];
    const before = toolActivity(sinceOf("today"));
    for (const row of rows) auditLog().put(row);
    const after = toolActivity(sinceOf("today"));
    for (const row of rows) auditLog().remove(row.id);
    const was = before.get("get_calendar") ?? { calls: 0, failed: 0, denied: 0, masked: 0 };
    expect(after.get("get_calendar")).toEqual({ calls: was.calls + 3, failed: was.failed + 1, denied: was.denied + 1, masked: was.masked + 1 });
    expect(PSEUDO_TOOLS.filter((tool) => after.has(tool))).toEqual([]);
  });
});

describe("a press on a matter", () => {
  test("is named by what was pressed, in Thai, beside the matter's own label", () => {
    const before = new Set(auditLog().all().map((row) => row.id));
    recordMatterEvent({ userId: "u_krit", code: "matter-label-probe", action: "accept", toUserId: null, refusal: null });
    const written = auditLog().all().filter((row) => !before.has(row.id));
    for (const row of written) auditLog().remove(row.id);
    expect(written.map((row) => [toolLabel(row.tool), row.reason])).toEqual([[TH.admin.auditOnlyTools.matter, TH.matter.auditReason(TH.matter.actions.accept)]]);
    expect(toolLabel(MATTER_AUDIT_TOOL)).not.toBe(toolLabel("share"));
  });
});
