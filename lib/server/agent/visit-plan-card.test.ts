import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { CardComposer } from "@/lib/compose/composer";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { VISIT_PLAN_CARD } from "./persona";

async function visitPlanOf(userId: string): Promise<unknown> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const tool = winyuTools().visit_plan;
  return runWithAccess(accessFor(user), () => tool.execute(tool.inputSchema().parse({ limit: 5 })));
}

describe("the visit-plan card the prompt hands the rep (AI-217)", () => {
  test("holds whole against what visit_plan returns: every line draws, one item per agent", async () => {
    const output = await visitPlanOf("u_krit");
    const composer = new CardComposer([{ tool: "visit_plan", output }]);
    for (const line of VISIT_PLAN_CARD) composer.read(line);
    const outcome = composer.finish();
    expect(outcome.problems).toEqual([]);
    expect(outcome.rejected).toBe(0);
    expect(outcome.surface?.components.map((component) => component.id)).toEqual(["root", "first", "agents", "agent"]);
    const rows = (output as { rows: unknown[] }).rows;
    expect(rows.length).toBeGreaterThan(1);
  });
});
