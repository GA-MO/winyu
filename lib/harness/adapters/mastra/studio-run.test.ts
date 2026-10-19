import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { wrapLanguageModel } from "ai";
import { meterMiddleware } from "@/lib/server/usage-meter";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
const metered = wrapLanguageModel({ model: scripted.model, middleware: [meterMiddleware(scripted.model.modelId)] });
const scriptedModels = scripted.modelsModule();
mock.module("@/lib/server/models", () => ({ ...scriptedModels, agentModel: () => ({ id: "scripted", name: "scripted", chat: () => metered, model: () => metered }) }));

const { studioApi } = await import("./studio");
const { modelCalls } = await import("@/lib/server/model-ledger");
const { auditLog } = await import("@/lib/server/audit");

const STUDIO_ORIGIN = "http://localhost:3213";
const API = "http://studio.test/api";
const CLIENT_RESOURCE = "winyu";
const SALES_BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };

async function ask(userId: string, thread: string, content: string): Promise<Response> {
  const app = await studioApi(STUDIO_ORIGIN);
  const body = { messages: [{ role: "user", content }], memory: { thread, resource: CLIENT_RESOURCE }, requestContext: { userId } };
  return app.fetch(new Request(`${API}/agents/winyu/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

async function askedAsThana(): Promise<void> {
  scripted.script([{ call: "query_metric", args: SALES_BY_REGION }, { text: "ยอดขายแยกภาค" }]);
  const thread = crypto.randomUUID();
  await (await ask("u_thana", thread, "ยอดขายเดือนนี้แยกภาค")).text();
}

describe("a Studio chat run", () => {
  test("spends as the persona, under source studio, one turn id for the whole request", async () => {
    const before = new Set(modelCalls().all().map((call) => call.id));
    await askedAsThana();
    const calls = modelCalls().all().filter((call) => !before.has(call.id));
    expect(calls.length).toBe(2);
    expect(calls.map((call) => [call.source, call.userId])).toEqual([["studio", "u_thana"], ["studio", "u_thana"]]);
    expect(new Set(calls.map((call) => call.turnId)).size).toBe(1);
    expect(calls[0].turnId).not.toBeNull();
  });

  test("audits its tool calls as initiated by studio, under the turn its spend is kept on", async () => {
    const before = new Set(modelCalls().all().map((call) => call.id));
    await askedAsThana();
    const turnId = modelCalls().all().find((call) => !before.has(call.id))?.turnId;
    const rows = auditLog().all().filter((row) => row.tool === "query_metric" && row.turnId === turnId);
    expect(rows.map((row) => [row.userId, row.initiator])).toEqual([["u_thana", "studio"]]);
  });
});
