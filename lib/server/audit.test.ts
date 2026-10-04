import { describe, expect, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { liveAccessFor } from "@/lib/access/enforce";
import { gated } from "@/lib/harness/gateway";
import { winyuTool } from "@/lib/server/tools/registry";
import { auditLog } from "./audit";
import { runWithAccess, runWithTurn } from "./request-context";
import { sinceOf, toolActivity } from "./usage";

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

  test("activity counts calls and the ones refused or failed", () => {
    const stamp = new Date().toISOString();
    const rows = ["allow", "deny"].map((decision, index) => ({ id: `activity-${index}`, at: stamp, userId: "u_krit", tool: "activity_probe", argsHash: "x", decision: decision as "allow" | "deny", rowsReturned: 0, latencyMs: 1 }));
    for (const row of rows) auditLog().put(row);
    const activity = toolActivity(sinceOf("today")).get("activity_probe");
    for (const row of rows) auditLog().remove(row.id);
    expect(activity).toEqual({ calls: 2, failed: 1 });
  });
});
