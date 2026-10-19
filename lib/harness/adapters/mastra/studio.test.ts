import { describe, expect, test } from "bun:test";
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { USER_ID_KEY, studioResourceOf, winyuMastra } from "./agent";
import { studioApi } from "./studio";

const STUDIO_ORIGIN = "http://localhost:3213";
const AGENT = "http://studio.test/api/agents/winyu";
const EXECUTE = `${AGENT}/tools/query_metric/execute`;
const SALES_BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };

type ToolAnswer = { ok?: boolean; query?: { scopeApplied?: { region?: string[] } }; error?: unknown };

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
    expect(body.query?.scopeApplied?.region).toEqual(["northeast"]);
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

  test("the agent refuses a memory resource that is not the persona's own", async () => {
    const instructionsWith = async (resource: string) => {
      const requestContext = new RequestContext();
      requestContext.set(USER_ID_KEY, "u_krit");
      requestContext.set(MASTRA_RESOURCE_ID_KEY, resource);
      return winyuMastra().getAgent("winyu").getInstructions({ requestContext });
    };
    await expect(instructionsWith(studioResourceOf("u_krit"))).resolves.toBeDefined();
    await expect(instructionsWith("u_krit")).resolves.toBeDefined();
    await expect(instructionsWith(studioResourceOf("u_thana"))).rejects.toThrow("does not belong to u_krit");
  });
});
