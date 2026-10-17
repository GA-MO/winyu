import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { adoptionSummary } from "@/lib/server/adoption";
import { winyuTools } from "@/lib/server/agent/tools";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { recordAction } from "@/lib/server/threads";
import { usageSummary } from "@/lib/server/usage";

type Report = { ok: boolean; summary: string; rows: Record<string, unknown>[] };

async function userUsage(): Promise<Report> {
  const user = findUser("u_ton");
  if (!user) throw new Error("no u_ton");
  return runWithAccess(accessFor(user), () => winyuTools().admin_audit.execute({ topic: "user_usage", days: 7, role: null }) as Promise<Report>);
}

function askedAndAnswered(userId: string, threadId: string, prompt: string, tool: string | null): void {
  const at = new Date().toISOString();
  if (tool) auditLog().put({ id: `${threadId}-${tool}`, at, userId, tool, argsHash: "x", decision: "allow", rowsReturned: 1, latencyMs: 1, initiator: "person", threadId, question: prompt });
  recordAction(userId, "question", "", prompt, threadId);
}

describe("IT usage figures agree across surfaces (AI-232)", () => {
  test("someone who only opened their feed is counted the same by the console and by the admin's audit tool", async () => {
    recordAction("u_may", "feed_open", "feed:alert:x", null, null);
    const active = adoptionSummary().activeByRole.reduce((sum, entry) => sum + entry.active, 0);
    const report = await userUsage();
    expect(report.rows.some((row) => row.user_name === findUser("u_may")?.nameTh)).toBe(true);
    expect(report.rows).toHaveLength(active);
    expect(report.summary).toContain(`${active} คน`);
  });

  test("a request answered by a send, pin or admin tool is not listed as unanswered; one no tool answered is", () => {
    askedAndAnswered("u_krit", "t-ai232-pin", "ปักการ์ดนี้ไว้ที่ Dashboard AI-232", "pin_widget");
    askedAndAnswered("u_thana", "t-ai232-send", "ส่งเรื่องนี้ให้ผู้จัดการภาค AI-232", "send_card");
    askedAndAnswered("u_ton", "t-ai232-audit", "สัปดาห์นี้ใครใช้ Winyu AI-232", "admin_audit");
    askedAndAnswered("u_thana", "t-ai232-none", "x AI-232", null);
    const prompts = usageSummary().unanswered.map((question) => question.prompt);
    expect(prompts).toContain("x AI-232");
    expect(prompts.filter((prompt) => prompt.endsWith("AI-232"))).toEqual(["x AI-232"]);
  });

  test("a first reply under an hour is said in minutes, not as 0.0 hours", () => {
    expect(TH.admin.adoption.replyTime(38 / 3600)).not.toContain("0.0");
    expect(TH.admin.adoption.replyTime(38 / 3600)).toContain("นาที");
  });
});
