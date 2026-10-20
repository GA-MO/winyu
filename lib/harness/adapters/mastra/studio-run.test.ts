import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { wrapLanguageModel } from "ai";
import type { ModelCall } from "@/lib/server/model-ledger";
import { meterMiddleware } from "@/lib/server/usage-meter";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
const metered = wrapLanguageModel({ model: scripted.model, middleware: [meterMiddleware(scripted.model.modelId)] });
const scriptedModels = scripted.modelsModule();
mock.module("@/lib/server/models", () => ({ ...scriptedModels, agentModel: () => ({ ...scriptedModels.agentModel(), chat: () => metered, chatFallback: () => metered, model: () => metered }) }));

const { studioApi } = await import("./studio");
const { modelCalls } = await import("@/lib/server/model-ledger");
const { auditLog } = await import("@/lib/server/audit");

const STUDIO_ORIGIN = "http://localhost:3213";
const API = "http://studio.test/api";
const CLIENT_RESOURCE = "winyu";
const SUBSCRIPTION_WAIT_MS = 5000;
const LEDGER_POLL_MS = 25;
const SALES_BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };

type Thread = { id: string; resourceId: string };

async function ask(userId: string, thread: string, content: string): Promise<Response> {
  const app = await studioApi(STUDIO_ORIGIN);
  const body = { messages: [{ role: "user", content }], memory: { thread, resource: CLIENT_RESOURCE }, requestContext: { userId } };
  return app.fetch(new Request(`${API}/agents/winyu/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

async function threadsListed(resourceId: string, userId?: string): Promise<Thread[]> {
  const app = await studioApi(STUDIO_ORIGIN);
  const context = userId ? `&requestContext=${encodeURIComponent(JSON.stringify({ userId }))}` : "";
  const response = await app.fetch(new Request(`${API}/memory/threads?agentId=winyu&resourceId=${encodeURIComponent(resourceId)}${context}`));
  const body = (await response.json()) as { threads?: Thread[] };
  return body.threads ?? [];
}

async function postTo(path: string, body: unknown): Promise<Response> {
  const app = await studioApi(STUDIO_ORIGIN);
  return app.fetch(new Request(`${API}/agents/winyu/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

async function openedAs(userId: string): Promise<void> {
  const app = await studioApi(STUDIO_ORIGIN);
  await app.fetch(new Request(`${API}/agents/winyu?requestContext=${encodeURIComponent(JSON.stringify({ userId }))}`));
}

async function readUntil(stream: ReadableStream<Uint8Array>, expected: string): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let read = "";
  const deadline = Date.now() + SUBSCRIPTION_WAIT_MS;
  while (!read.includes(expected) && Date.now() < deadline) {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), deadline - Date.now()));
    const chunk = await Promise.race([reader.read(), timeout]);
    if (!chunk || chunk.done) break;
    read += decoder.decode(chunk.value);
  }
  await reader.cancel();
  return read;
}

async function callsSince(before: ReadonlySet<string>): Promise<ModelCall[]> {
  const deadline = Date.now() + SUBSCRIPTION_WAIT_MS;
  while (Date.now() < deadline) {
    const calls = modelCalls().all().filter((call) => !before.has(call.id));
    if (calls.length > 0) return calls;
    await Bun.sleep(LEDGER_POLL_MS);
  }
  return [];
}

async function askedAsThana(): Promise<string> {
  scripted.script([{ call: "query_metric", args: SALES_BY_REGION }, { text: "ยอดขายแยกภาค" }]);
  const thread = crypto.randomUUID();
  await (await ask("u_thana", thread, "ยอดขายเดือนนี้แยกภาค")).text();
  return thread;
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

  test("keeps the thread under the persona's own Studio resource, whatever resource the client sent", async () => {
    const thread = await askedAsThana();
    expect((await threadsListed(CLIENT_RESOURCE, "u_thana")).map((listed) => [listed.id, listed.resourceId])).toContainEqual([thread, "studio:u_thana"]);
    expect((await threadsListed("u_thana", "u_thana")).map((listed) => listed.id)).toContain(thread);
  });

  test("another persona can neither list nor continue that thread", async () => {
    const thread = await askedAsThana();
    expect((await threadsListed("studio:u_thana", "u_krit")).map((listed) => listed.id)).not.toContain(thread);
    const calls = scripted.calls;
    scripted.script([{ text: "เมื่อกี้ถามว่า..." }]);
    const response = await ask("u_krit", thread, "เมื่อกี้ถามอะไร");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(scripted.calls).toBe(calls);
  });

  test("without a persona, a client-named resource lists nothing", async () => {
    const thread = await askedAsThana();
    expect((await threadsListed("studio:u_thana", "u_thana")).map((listed) => listed.id)).toContain(thread);
    expect(await threadsListed("studio:u_thana")).toEqual([]);
  });

  test("without a persona, a run is refused before any model call", async () => {
    const calls = scripted.calls;
    scripted.script([{ text: "ไม่ควรถึงตรงนี้" }]);
    const response = await ask("", crypto.randomUUID(), "ยอดขาย");
    expect(response.status).toBe(400);
    expect(scripted.calls).toBe(calls);
  });

  test("a message Studio sends as a signal runs as the persona and streams to the thread Studio subscribed to before it existed", async () => {
    await openedAs("u_thana");
    const thread = crypto.randomUUID();
    const subscription = await postTo("threads/subscribe", { resourceId: CLIENT_RESOURCE, threadId: thread });
    scripted.script([{ text: "สวัสดีค่ะ" }]);
    const before = new Set(modelCalls().all().map((call) => call.id));
    const sent = await postTo("send-message", { resourceId: CLIENT_RESOURCE, threadId: thread, message: "สวัสดี", ifIdle: { streamOptions: { requestContext: { userId: "u_thana" } } } });
    expect(sent.status).toBe(200);
    expect(await readUntil(subscription.body ?? new ReadableStream(), "สวัสดีค่ะ")).toContain("สวัสดีค่ะ");
    expect((await callsSince(before)).map((call) => [call.source, call.userId])).toEqual([["studio", "u_thana"]]);
    expect((await threadsListed(CLIENT_RESOURCE, "u_thana")).map((listed) => [listed.id, listed.resourceId])).toContainEqual([thread, "studio:u_thana"]);
  });
});
