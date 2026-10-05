import { afterEach, describe, expect, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { runStore } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { a2aToolsFor, agentCard, handleA2aRequest, handleAgentCardRequest } from "./a2a";
import { ACCESS_TOKENS_COLLECTION, issueToken, revokeToken } from "./access-tokens";
import { auditLog } from "./audit";
import { collection } from "./store/json-store";

const ADMIN = "u_ton";
const CEO = "u_thana";
const SALES_REP = "u_krit";
const CALLER = "Finance agent";
const ENDPOINT = "http://localhost/api/a2a";
const NORTHEAST = "ภาคอีสาน";
const PHONE = "081-234-5678";
const BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-07-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };
const REPLY = "ยอดขายเข้าไตรมาสนี้แยกตามภาคตามที่แนบไว้";
const USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };

type Generated = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
type ToolData = { tool: string; args: unknown; result: { ok?: boolean; rows?: { region?: string }[] } };
type TaskResult = { id: string; status: { state: string }; artifacts?: { name?: string; parts: { kind: string; text?: string; data?: { tools?: ToolData[] } }[] }[] };
type RpcAnswer = { result?: TaskResult; error?: { code: number; message: string } };

const issuedIds: string[] = [];
const auditBefore = new Set(auditLog().all().map((row) => row.id));
const runsBefore = new Set(runStore().all().map((run) => run.id));

afterEach(() => {
  for (const id of issuedIds.splice(0)) collection(ACCESS_TOKENS_COLLECTION).remove(id);
  for (const row of auditLog().all()) if (!auditBefore.has(row.id)) auditLog().remove(row.id);
  for (const run of runStore().all()) if (!runsBefore.has(run.id)) runStore().remove(run.id);
});

function tokenFor(userId: string, channel: "a2a" | "mcp" = "a2a"): { token: string; id: string } {
  const issued = issueToken(userId, ADMIN, channel, channel === "a2a" ? CALLER : null);
  if (!issued) throw new Error(`no user ${userId}`);
  issuedIds.push(issued.record.id);
  return { token: issued.token, id: issued.record.id };
}

function toolCallStep() {
  return { content: [{ type: "tool-call", toolCallId: "c1", toolName: "query_metric", input: JSON.stringify(BY_REGION) }], finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE, warnings: [] };
}

function textStep(text: string) {
  return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: "stop" }, usage: USAGE, warnings: [] };
}

function scripted(prompts: string[]): () => MockLanguageModelV3 {
  let call = 0;
  const steps = [toolCallStep(), textStep(REPLY)];
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      const step = steps[Math.min(call, steps.length - 1)];
      call += 1;
      return step as unknown as Generated;
    },
  });
  return () => model;
}

function rpc(method: string, params: unknown, id: number | string = 1): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function question(text: string): unknown {
  return { message: { kind: "message", role: "user", messageId: crypto.randomUUID(), parts: [{ kind: "text", text }] } };
}

async function post(body: string, token: string | null, model = scripted([]), headers: Record<string, string> = {}): Promise<Response> {
  return handleA2aRequest(new Request(ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }), model);
}

async function asked(token: string, text: string, prompts: string[] = []): Promise<RpcAnswer> {
  return (await post(rpc("message/send", question(text)), token, scripted(prompts))).json() as Promise<RpcAnswer>;
}

function toolDataOf(answer: RpcAnswer): ToolData[] {
  return answer.result?.artifacts?.flatMap((artifact) => artifact.parts.flatMap((part) => part.data?.tools ?? [])) ?? [];
}

function textOf(answer: RpcAnswer): string {
  return answer.result?.artifacts?.flatMap((artifact) => artifact.parts.flatMap((part) => (part.kind === "text" ? [part.text ?? ""] : []))).join("") ?? "";
}

describe("the A2A agent card", () => {
  test("is public, points at the JSON-RPC endpoint on the caller's host, asks for a bearer token and offers no streaming", async () => {
    const card = await handleAgentCardRequest(new Request("http://localhost:3219/.well-known/agent-card.json")).json();
    expect(card).toEqual(agentCard("http://localhost:3219"));
    expect(card.url).toBe("http://localhost:3219/api/a2a");
    expect(card.security).toEqual([{ bearer: [] }]);
    expect(card.capabilities.streaming).toBe(false);
  });
});

describe("the A2A endpoint", () => {
  test("a missing, unknown, revoked or MCP token is refused with 401 before anything runs", async () => {
    const revoked = tokenFor(SALES_REP);
    revokeToken(revoked.id);
    const statuses = await Promise.all([null, "a2a_not-a-real-token", revoked.token, tokenFor(SALES_REP, "mcp").token].map(async (token) => (await post(rpc("message/send", question("ยอดขาย")), token)).status));
    expect(statuses).toEqual([401, 401, 401, 401]);
  });

  test("the CEO's answer carries every region and the sales rep's only the northeast, as text plus the tool rows", async () => {
    const ceo = await asked(tokenFor(CEO).token, "ยอดขายเข้าแยกตามภาคไตรมาสนี้");
    const rep = await asked(tokenFor(SALES_REP).token, "ยอดขายเข้าแยกตามภาคไตรมาสนี้");
    expect([ceo.result?.status.state, rep.result?.status.state]).toEqual(["completed", "completed"]);
    expect(textOf(ceo)).toBe(REPLY);
    const ceoRegions = new Set(toolDataOf(ceo)[0]?.result.rows?.map((row) => row.region));
    const repRegions = toolDataOf(rep)[0]?.result.rows?.map((row) => row.region);
    expect(ceoRegions.size).toBeGreaterThan(1);
    expect(repRegions).toEqual([NORTHEAST]);
    expect(toolDataOf(rep)[0]?.tool).toBe("query_metric");
  });

  test("a question leaves an audit row on the A2A channel for the token's person and a saved run that names the calling agent", async () => {
    await asked(tokenFor(SALES_REP).token, "ยอดขายเข้าแยกตามภาคไตรมาสนี้");
    const row = auditLog().all().find((entry) => !auditBefore.has(entry.id) && entry.tool === "query_metric");
    expect([row?.initiator, row?.userId, row?.decision, row?.question]).toEqual(["a2a", SALES_REP, "allow", "ยอดขายเข้าแยกตามภาคไตรมาสนี้"]);
    const run = row?.turnId ? runStore().get(row.turnId) : null;
    const start = run?.events.find((event) => event.type === "agent.started");
    expect(start?.type === "agent.started" ? start.payload.goal.intent : null).toBe(`a2a:${CALLER}`);
    expect(run?.events.at(-1)?.type).toBe("agent.completed");
  });

  test("offers only read tools, so no call can wait on an approval nobody can give", () => {
    for (const userId of [CEO, SALES_REP, ADMIN]) {
      const user = findUser(userId);
      if (!user) throw new Error(userId);
      const tiers = a2aToolsFor(liveAccessFor(user)).map((tool) => tool.entry.tier);
      expect(tiers.length).toBeGreaterThan(0);
      expect(tiers.every((tier) => tier === "read")).toBe(true);
    }
  });

  test("personal data in the calling agent's question is masked before the model reads it", async () => {
    const prompts: string[] = [];
    await asked(tokenFor(SALES_REP).token, `ยอดขายลูกค้าเบอร์ ${PHONE}`, prompts);
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.join("")).not.toContain(PHONE);
    expect(prompts.join("")).toContain(TH.guard.mask.phone);
  });

  test("streaming is refused as unsupported, an unknown method as not found, and another person's task is not found", async () => {
    const stream = (await (await post(rpc("message/stream", question("ยอดขาย")), tokenFor(CEO).token)).json()) as RpcAnswer;
    const unknown = (await (await post(rpc("tasks/pushNotificationConfig/set", {}), tokenFor(CEO).token)).json()) as RpcAnswer;
    expect([stream.error?.code, unknown.error?.code]).toEqual([-32004, -32601]);
    const ceoToken = tokenFor(CEO).token;
    const mine = await asked(ceoToken, "ยอดขายเข้าแยกตามภาค");
    const taskId = mine.result?.id;
    const own = (await (await post(rpc("tasks/get", { id: taskId }), ceoToken)).json()) as RpcAnswer;
    const others = (await (await post(rpc("tasks/get", { id: taskId }), tokenFor(SALES_REP).token)).json()) as RpcAnswer;
    expect(own.result?.id).toBe(taskId);
    expect(others.error?.code).toBe(-32001);
  });

  test("a version other than 0.3 is refused", async () => {
    const answer = (await (await post(rpc("message/send", question("ยอดขาย")), tokenFor(CEO).token, scripted([]), { "A2A-Version": "1.0" })).json()) as RpcAnswer;
    expect(answer.error?.code).toBe(-32009);
  });
});
