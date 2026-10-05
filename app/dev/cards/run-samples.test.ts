import { describe, expect, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { auditLog } from "@/lib/server/audit";
import { GET as health } from "@/app/api/health/route";
import { runSamples } from "./run-samples";
import { READ_SAMPLES } from "./samples";

const PLANNER = "u_wee";
const REVENUE_BY_REGION = "ยอดขายเป็นเงินเดือนนี้แยกตามภาค";

function rowsSince(count: number) {
  return auditLog().all().slice(count).filter((entry) => entry.userId === PLANNER);
}

describe("development surfaces that run tools as a persona", () => {
  test("the card gallery's calls are audited as system with their own run, never as the person asking in chat, and the planner's refused revenue query stays on record", async () => {
    const user = findUser(PLANNER);
    if (!user) throw new Error(`no ${PLANNER}`);
    const before = auditLog().all().length;
    await runSamples(user, READ_SAMPLES);
    const rows = rowsSince(before);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((entry) => entry.initiator !== "system")).toEqual([]);
    expect(rows.every((entry) => typeof entry.turnId === "string")).toBe(true);
    const refused = rows.find((entry) => entry.tool === "query_metric" && entry.question === REVENUE_BY_REGION);
    expect(refused).toMatchObject({ decision: "deny", code: "PERMISSION_DENIED", initiator: "system" });
  });

  test("the health check's query is audited as system", async () => {
    const before = auditLog().all().length;
    await health(new Request(`http://localhost/api/health?user=${PLANNER}`));
    expect(rowsSince(before).map((entry) => [entry.tool, entry.initiator])).toEqual([["query_metric", "system"]]);
  });
});
