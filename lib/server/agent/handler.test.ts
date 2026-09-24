import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { liveAccessFor } from "@/lib/access/enforce";
import { setRoleTool } from "@/lib/access/role-overrides";
import type { AccessContext } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { handlerFor } from "./handler";

const CHAT_URL = "http://localhost:3100/api/chat";

type Turn = { text: string; toolOutputs: Record<string, unknown>[]; raw: string };

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function events(raw: string): Record<string, unknown>[] {
  return raw
    .split("\n")
    .filter((line) => line.startsWith("data: ") && !line.startsWith("data: [DONE]"))
    .map((line) => JSON.parse(line.slice("data: ".length)) as Record<string, unknown>);
}

async function ask(userId: string, prompt: string): Promise<Turn> {
  const access = accessOf(userId);
  const body = { id: `t-${userId}`, model: "mock", messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: prompt }] }] };
  const request = new Request(CHAT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await runWithAccess(access, () => handlerFor(access).POST(request));
  expect(response.status).toBe(200);
  const raw = await response.text();
  const parts = events(raw);
  return {
    raw,
    text: parts
      .filter((part) => part.type === "text-delta")
      .map((part) => String(part.delta ?? ""))
      .join(""),
    toolOutputs: parts.filter((part) => part.type === "tool-output-available").map((part) => part.output as Record<string, unknown>),
  };
}

describe("handlerFor", () => {
  test("memoizes one handler per role", () => {
    expect(handlerFor(accessOf("u_anucha"))).toBe(handlerFor(accessOf("u_nattaya")));
    expect(handlerFor(accessOf("u_anucha"))).not.toBe(handlerFor(accessOf("u_thana")));
  });

  test("an admin override gives the role a handler with the new tool set on the next question", () => {
    const krit = findUser("u_krit");
    if (!krit) throw new Error("missing u_krit");
    const before = handlerFor(liveAccessFor(krit));
    setRoleTool("sales_rep", "list_courses", false, "u_ton");
    const after = handlerFor(liveAccessFor(krit));
    setRoleTool("sales_rep", "list_courses", true, "u_ton");
    expect(after).not.toBe(before);
    expect(handlerFor(liveAccessFor(krit))).toBe(before);
  });

  test("an RSM asking outside its region gets PERMISSION_DENIED and is told so", async () => {
    const turn = await ask("u_anucha", "ยอดขายภาคใต้");
    expect(turn.toolOutputs.length).toBe(1);
    expect(turn.toolOutputs[0].code).toBe("PERMISSION_DENIED");
    expect(turn.text).toContain("นอกขอบเขต");
  });

  test("the CEO gets rows for the same question", async () => {
    const turn = await ask("u_thana", "ยอดขายภาคใต้");
    const output = turn.toolOutputs[0] as { ok: boolean; rows: unknown[] };
    expect(output.ok).toBe(true);
    expect(output.rows.length).toBeGreaterThan(0);
    expect(turn.raw).toContain("DataCard");
    expect(turn.raw).toContain("/tools/query_metric");
    expect(turn.text).toContain("ยอดขาย");
  });

  test("a masked metric renders the masked warning", async () => {
    const turn = await ask("u_krit", "เงินเดือนเฉลี่ยแต่ละฝ่าย");
    const output = turn.toolOutputs[0] as { ok: boolean; provenance: { masked: string[] } };
    expect(output.ok).toBe(true);
    expect(output.provenance.masked.length).toBeGreaterThan(0);
    expect(turn.raw).toContain("***");
    expect(turn.raw).toContain("DataCard");
  });

  test("a sales rep may resolve an owner but never reaches create_handoff", async () => {
    const turn = await ask("u_krit", "ส่งต่องานให้ผู้รับผิดชอบ");
    expect(turn.toolOutputs.length).toBe(1);
    expect(turn.toolOutputs[0]).toMatchObject({ ok: true });
    expect(turn.text).toContain("create_handoff is not available");
  });

  test("an RSM handoff resolves the trade marketing owner and stops at the approval card", async () => {
    const turn = await ask("u_anucha", "ส่งต่องานให้ผู้รับผิดชอบ");
    expect(turn.toolOutputs[0]).toMatchObject({ ok: true, data: { userId: "u_pim" } });
    expect(turn.raw).toContain("tool-approval-request");
    expect(turn.raw).not.toContain("tool-output-available\",\"toolCallId\":\"mock-create_handoff");
  });

  test("every tool call the turn made leaves an audit entry", async () => {
    const before = auditLog().all().length;
    await ask("u_anucha", "เอเย่นต์รายไหนยอดตกบ้าง top 10");
    const entries = auditLog().all();
    expect(entries.length).toBe(before + 1);
    expect(entries[entries.length - 1]).toMatchObject({ userId: "u_anucha", tool: "query_metric", decision: "allow" });
  });
});
