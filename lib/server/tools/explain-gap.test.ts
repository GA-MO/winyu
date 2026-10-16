import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { DATA_AS_OF, dataDay, monthStart } from "@/lib/data/dates";
import { runWithAccess } from "@/lib/server/request-context";
import { winyuTools } from "@/lib/server/agent/tools";

type GapResult = { ok: true; share_note: string | null; contributors: { label: string; share_label: string }[] };

async function gapAs(userId: string, input: Record<string, unknown>): Promise<GapResult> {
  const user = findUser(userId);
  if (!user) throw new Error(`no ${userId}`);
  const tool = winyuTools().explain_gap;
  return (await runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse(input)))) as GapResult;
}

describe("explain_gap says when no part stands out", () => {
  test("a company-wide weekly drop split by agent, where the biggest agent is a few percent of the gap, carries the broad note (AI-145)", async () => {
    const result = await gapAs("u_thana", { metric: "net_sales_value", split: "agent", filters: {}, range: { from: dataDay(-3), to: DATA_AS_OF }, compare: "prev_period" });
    expect(result.ok).toBe(true);
    expect(result.share_note).toContain("ไม่มีส่วนไหนเด่น");
    expect(result.share_note).toContain(result.contributors[0]?.share_label ?? "-");
  });

  test("Isan's month against target, where two agents make most of the gap, carries no broad note", async () => {
    const result = await gapAs("u_thana", { metric: "net_sales_value", split: "agent", filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" });
    expect(result.share_note ?? "").not.toContain("ไม่มีส่วนไหนเด่น");
  });
});
