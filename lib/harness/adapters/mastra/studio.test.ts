import { describe, expect, test } from "bun:test";
import { studioApi } from "./studio";

const STUDIO_ORIGIN = "http://localhost:3213";
const EXECUTE = "http://studio.test/api/agents/winyu/tools/query_metric/execute";
const SALES_BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };

type ToolAnswer = { ok?: boolean; provenance?: { scopeApplied?: { region?: string[] } }; error?: unknown };

async function execute(requestContext?: Record<string, string>): Promise<{ status: number; body: ToolAnswer }> {
  const app = await studioApi(STUDIO_ORIGIN);
  const response = await app.fetch(new Request(EXECUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: SALES_BY_REGION, ...(requestContext ? { requestContext } : {}) }) }));
  return { status: response.status, body: (await response.json()) as ToolAnswer };
}

describe("the Studio API", () => {
  test("runs a tool as the persona in the request context, through the gateway's scope", async () => {
    const { status, body } = await execute({ userId: "u_krit" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.provenance?.scopeApplied?.region).toEqual(["northeast"]);
  });

  test("grants nothing without a persona", async () => {
    const { status, body } = await execute();
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.ok).toBeUndefined();
  });

  test("grants nothing to an unknown persona", async () => {
    const { status } = await execute({ userId: "u_nobody" });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
