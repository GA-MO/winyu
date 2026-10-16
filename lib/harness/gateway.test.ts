import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { outbox } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { shares } from "@/lib/server/share/shares";
import { approvedCallId } from "@/scripts/approved-call";
import { markAnswered, recordAsked } from "./approvals";
import { gated } from "./gateway";
import type { Capability } from "./types";

const SENDER = "u_thana";
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const TO_KRIT = { to: ["คุณกฤต"], note: "ช่วยดูภาคอีสานหน่อย" };

function turn(): TurnContext {
  return { turnId: null, threadId: null, preloadPacketId: null, question: "ส่งการ์ดนี้ให้คุณกฤต", queries: [], cardOnScreen: async () => ({ card: { kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] }, question: "ยอดขายแยกตามภาค" }) };
}

function sender() {
  const user = findUser(SENDER);
  if (!user) throw new Error(`no ${SENDER}`);
  return liveAccessFor(user);
}

async function share(toolCallId: string, input: unknown = TO_KRIT): Promise<{ ok: boolean; code?: string; error?: string }> {
  const result = await runWithAccess(sender(), () => runWithTurn(turn(), () => winyuTools().share_card.execute(input, { toolCallId })));
  return result as { ok: boolean; code?: string; error?: string };
}

type Effects = { shares: number; mails: number };

function effects(): Effects {
  return { shares: shares().where((entry) => entry.senderId === SENDER).length, mails: outbox().where((entry) => entry.kind === "share").length };
}

function effectsSince(before: Effects): Effects {
  const now = effects();
  return { shares: now.shares - before.shares, mails: now.mails - before.mails };
}

function auditOf(toolCallId: string) {
  return auditLog().where((entry) => entry.toolCallId === toolCallId).map((entry) => ({ decision: entry.decision, code: entry.code }));
}

describe("the gateway fails closed on a write that needs a yes", () => {
  test("with no recorded yes the call does nothing and is audited as refused, not approved", async () => {
    const before = effects();
    const toolCallId = randomUUID();
    expect(await share(toolCallId)).toMatchObject({ ok: false, code: "NOT_APPROVED" });
    expect(effectsSince(before)).toEqual({ shares: 0, mails: 0 });
    expect(auditOf(toolCallId)).toEqual([{ decision: "deny", code: "NOT_APPROVED" }]);
  });

  test("a yes to another call, another person's yes, or a yes still unanswered does not let this call act", async () => {
    const before = effects();
    approvedCallId(SENDER, "share_card");
    const othersYes = approvedCallId("u_krit", "share_card");
    const asked = randomUUID();
    recordAsked(`asked::${asked}`, SENDER, asked, "share_card");
    expect(await share(randomUUID())).toMatchObject({ code: "NOT_APPROVED" });
    expect(await share(othersYes)).toMatchObject({ code: "NOT_APPROVED" });
    expect(await share(asked)).toMatchObject({ code: "NOT_APPROVED" });
    expect(effectsSince(before)).toEqual({ shares: 0, mails: 0 });
  });

  test("an approved call runs once: the same call sent again is refused", async () => {
    const before = effects();
    const toolCallId = approvedCallId(SENDER, "share_card");
    expect(await share(toolCallId)).toMatchObject({ ok: true });
    expect(await share(toolCallId)).toMatchObject({ ok: false, code: "NOT_APPROVED" });
    expect(effectsSince(before)).toEqual({ shares: 1, mails: 1 });
  });

  test("a declined call never runs", async () => {
    const before = effects();
    const toolCallId = randomUUID();
    recordAsked(`declined::${toolCallId}`, SENDER, toolCallId, "share_card");
    markAnswered(`declined::${toolCallId}`, false);
    expect(await share(toolCallId)).toMatchObject({ ok: false, code: "NOT_APPROVED" });
    expect(effectsSince(before)).toEqual({ shares: 0, mails: 0 });
  });

  test("a write that is not ready returns its fix and acts on nothing, even with a yes", async () => {
    const before = effects();
    const result = await share(approvedCallId(SENDER, "share_card"), { to: ["จันทร"] });
    expect(result).toMatchObject({ ok: false, code: "UNRESOLVED_RECIPIENT" });
    expect(result.error).toContain("คุณกฤต จันทร์เสน");
    expect(effectsSince(before)).toEqual({ shares: 0, mails: 0 });
  });

  test("the gateway never runs a not-ready write's tool, whatever the tool itself would check", async () => {
    let ran = 0;
    const capability: Capability = { name: "share_card", connector: "winyu", tier: "write", roles: "all", labelTh: "", bodyTh: "", timeoutMs: 1000, ready: () => ({ code: "UNRESOLVED_RECIPIENT", fix: "ระบุผู้รับให้ชัด" }), verify: null, correct: null, redact: [] };
    const write = gated(capability, async () => {
      ran += 1;
      return { ok: true };
    });
    const result = await runWithAccess(sender(), () => write({}, { toolCallId: approvedCallId(SENDER, "share_card") }));
    expect(result).toEqual({ ok: false, code: "UNRESOLVED_RECIPIENT", error: "ระบุผู้รับให้ชัด" });
    expect(ran).toBe(0);
  });
});
