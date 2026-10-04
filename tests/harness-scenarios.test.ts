import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import type { AccessContext } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { simulateReadableStream, stepCountIs, wrapLanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { serveChat, traceMiddleware, wrapUpAtLimit, type AgentEngine } from "@/lib/harness/adapters/vexa/agent";
import { vexaEngine, type HostPrepareStep } from "@/lib/harness/adapters/vexa/server";
import { LIMITS } from "@/lib/harness/limits";
import { toolTiers, toolsForAccess } from "@/lib/server/agent/tools";
import type { HarnessEvent, HarnessEventType } from "@/lib/harness/events";
import { gated } from "@/lib/harness/gateway";
import { newRun, runStore, runWithRun, tracedRun, type Run } from "@/lib/harness/runtime";
import type { Capability } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";
import { packets } from "@/lib/server/agent/collections";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { winyuTool } from "@/lib/server/tools/registry";
import { stateOf, type AgentState } from "@/lib/harness/state";
import { handlerFor } from "@/lib/server/agent/handler";

const CHAT_URL = "http://localhost:3100/api/chat";

type Traced = { events: HarnessEvent[]; state: AgentState; raw: string };

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function request(messages: unknown[], context: Record<string, unknown> = {}): Request {
  const body = { id: "harness-thread", model: "mock", context, messages };
  return new Request(CHAT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function userMessage(id: string, text: string) {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

async function traced(userId: string, messages: unknown[], context: Record<string, unknown> = {}): Promise<Traced> {
  const runId = crypto.randomUUID();
  const response = await serveChat(accessOf(userId), request(messages, { threadId: "harness-thread", ...context }), handlerFor, runId);
  const raw = await response.text();
  const record = runStore().get(runId);
  if (!record) throw new Error("the run left no trace");
  return { events: record.events, state: stateOf(runId, record.events), raw };
}

function typesOf(events: HarnessEvent[]): HarnessEventType[] {
  return events.map((event) => event.type);
}

describe("harness scenarios: one expected trace each", () => {
  test("read metric: goal, a model step asks for query_metric, the gateway allows it, the card renders, the goal completes", async () => {
    const { events, state } = await traced("u_thana", [userMessage("m1", "ยอดขายภาคใต้")]);
    expect(typesOf(events)).toEqual([
      "agent.started",
      "context.composed",
      "agent.thinking",
      "agent.tool.requested",
      "agent.decided",
      "tool.authorized",
      "tool.started",
      "tool.completed",
      "observation.created",
      "verification.passed",
      "agent.thinking",
      "agent.decided",
      "ui.rendered",
      "agent.completed",
    ]);
    expect(state.goal).toMatchObject({ id: "harness-thread:m1", userMessage: "ยอดขายภาคใต้", status: "completed" });
    expect(state.phase).toBe("completed");
    expect(Object.values(state.toolCalls).map((call) => [call.tool, call.status, call.verified])).toEqual([["query_metric", "succeeded", true]]);
    expect(state.uiState.components).toContain("DataCard");
    const composed = events.find((event) => event.type === "context.composed");
    expect(composed?.type === "context.composed" && composed.payload.items.map((item) => [item.id, item.source])).toEqual(expect.arrayContaining([["scope", "access.policy"], ["memory", "memory.relevant"]]));
  });
});

function capabilityOf(name: string): Capability {
  const capability = winyuTool(name)?.capability;
  if (!capability) throw new Error(`${name} is off the surface`);
  return capability;
}

async function inRun<T>(userId: string, work: () => Promise<T>): Promise<{ run: Run; result: T | Error }> {
  const run = newRun(userId, "harness-thread");
  const result = await runWithAccess(accessOf(userId), () => runWithRun(run, work)).catch((error: Error) => error);
  return { run, result };
}

const SOUTH_ROW = { region: "ภาคใต้", value: 1, value_label: "1" };

describe("harness scenarios: the gateway's own loop", () => {
  test("verification failure: a read that returns a row outside the caller's scope is withheld, never handed to the model", async () => {
    const leaky = gated(capabilityOf("query_metric"), async () => ({ ok: true, rows: [SOUTH_ROW], provenance: { masked: [] } }));
    const query = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: 5 };
    const { run, result } = await inRun("u_anucha", () => leaky(query, { toolCallId: "leak-1" }));
    expect(result).toMatchObject({ ok: false, code: "VERIFICATION_FAILED" });
    expect(JSON.stringify(result)).not.toContain("ภาคใต้");
    expect(typesOf(run.events)).toEqual(["tool.authorized", "tool.started", "tool.completed", "observation.created", "verification.failed", "recovery.decided"]);
    expect(stateOf(run.id, run.events).toolCalls["leak-1"].status).toBe("withheld");
    expect(auditLog().all().find((row) => row.toolCallId === "leak-1")).toMatchObject({ decision: "deny", code: "VERIFICATION_FAILED" });
  });

  test("tool failure, then retry: a read that throws once is retried and its second answer is used", async () => {
    let calls = 0;
    const flaky = gated(capabilityOf("list_metrics"), async () => {
      calls += 1;
      if (calls === 1) throw new Error("warehouse blinked");
      return { ok: true, rows: [] };
    });
    const { run, result } = await inRun("u_thana", () => flaky({ search: null }, { toolCallId: "flaky-1" }));
    expect(result).toEqual({ ok: true, rows: [] });
    expect(typesOf(run.events)).toEqual([
      "tool.authorized",
      "tool.started", "tool.failed", "observation.created", "recovery.decided",
      "tool.started", "tool.completed", "observation.created",
    ]);
    expect(run.events.find((event) => event.type === "recovery.decided")?.payload).toMatchObject({ action: "retry" });
  });

  test("tool failure, out of retries: a read that keeps throwing fails after one retry and the error reaches the caller", async () => {
    const broken = gated(capabilityOf("list_metrics"), async () => {
      throw new Error("warehouse down");
    });
    const { run, result } = await inRun("u_thana", () => broken({ search: null }, { toolCallId: "broken-1" }));
    expect(result).toBeInstanceOf(Error);
    expect(run.events.filter((event) => event.type === "tool.started")).toHaveLength(2);
    expect(run.events.filter((event) => event.type === "recovery.decided").map((event) => event.type === "recovery.decided" && event.payload.action)).toEqual(["retry", "return"]);
  });

  test("a write that fails is never retried on its own", async () => {
    let calls = 0;
    const write = gated(capabilityOf("watch_metric"), async () => {
      calls += 1;
      throw new Error("store locked");
    });
    const { run } = await inRun("u_thana", () => write({}, { toolCallId: "write-1" }));
    expect(calls).toBe(1);
    expect(run.events.find((event) => event.type === "recovery.decided")?.payload).toMatchObject({ action: "return" });
  });

  test("a slow write is never cut by the timer, so the model is never told it failed while it lands", async () => {
    const slowWrite = gated({ ...capabilityOf("watch_metric"), timeoutMs: 20, verify: null }, () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: {} }), 80)));
    const { result } = await inRun("u_thana", () => slowWrite({}, { toolCallId: "slow-write-1" }));
    expect(result).toMatchObject({ ok: true });
  });

  test("a slow read times out, is retried once, then returns TIMEOUT instead of hanging the run", async () => {
    const slow = gated({ ...capabilityOf("list_metrics"), timeoutMs: 20 }, () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, rows: [] }), 200)));
    const { run, result } = await inRun("u_thana", () => slow({ search: null }, { toolCallId: "slow-1" }));
    expect(result).toMatchObject({ ok: false, code: "TIMEOUT" });
    expect(run.events.filter((event) => event.type === "tool.failed").map((event) => event.type === "tool.failed" && event.payload.code)).toEqual(["TIMEOUT", "TIMEOUT"]);
  });
});

type StreamPart = Record<string, unknown> & { type: string };

function partsOf(raw: string): StreamPart[] {
  return raw.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice("data: ".length)) as StreamPart);
}

const PIN_INPUT = {
  title: "ยอดขายภาคใต้รายเดือน",
  kind: "metric",
  query: { metric: "net_sales_volume", dims: [], filters: { region: ["south"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: 5, sort: null, where: null },
};

function pressed(id: string, tool: string, input: unknown) {
  return userMessage(id, `⟦action⟧ runTool ${tool} ${JSON.stringify(input)}`);
}

function approvalAnswer(raw: string, approved: boolean, signature: (asked: string | undefined) => string | undefined) {
  const parts = partsOf(raw);
  const asked = parts.find((part) => part.type === "tool-approval-request");
  const call = parts.find((part) => part.type === "tool-input-available" && part.toolCallId === asked?.toolCallId);
  if (!asked || !call) throw new Error("the reply asked for no approval");
  return {
    id: "a-approval",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: `tool-${String(call.toolName)}`,
        toolCallId: asked.toolCallId,
        state: "approval-responded",
        input: call.input,
        approval: { id: asked.approvalId, approved, signature: signature(asked.signature as string | undefined) },
      },
    ],
  };
}

describe("harness scenarios: UI actions and approvals", () => {
  test("UI action: a pressed button starts a goal with its tool as intent, and a write stops at the approval card", async () => {
    const { events, state } = await traced("u_thana", [pressed("p1", "pin_widget", PIN_INPUT)]);
    expect(typesOf(events)).toEqual([
      "agent.started",
      "ui.action",
      "context.composed",
      "agent.thinking",
      "agent.tool.requested",
      "agent.decided",
      "approval.requested",
      "agent.completed",
    ]);
    expect(state.goal).toMatchObject({ intent: "ui:pin_widget", status: "active" });
    expect(state.phase).toBe("awaiting_approval");
    expect(state.uiState.actions).toEqual(["pin_widget"]);
  });

  test("approval granted: the signed answer runs the write through the gateway, verifies it, and completes the goal", async () => {
    const first = await traced("u_thana", [pressed("p2", "pin_widget", PIN_INPUT)]);
    const answer = approvalAnswer(first.raw, true, (signature) => signature);
    const second = await traced("u_thana", [pressed("p2", "pin_widget", PIN_INPUT), answer]);
    expect(typesOf(second.events).slice(0, 8)).toEqual([
      "agent.started",
      "ui.action",
      "approval.granted",
      "context.composed",
      "tool.authorized",
      "tool.started",
      "tool.completed",
      "observation.created",
    ]);
    expect(second.events.find((event) => event.type === "tool.authorized")?.payload).toMatchObject({ approval: "required" });
    expect(second.state.goal).toMatchObject({ id: first.state.goal?.id, status: "completed" });
  });

  test("approval replayed: a signed answer runs its write once; sending it again is refused and writes nothing", async () => {
    const input = { ...PIN_INPUT, title: "การ์ดที่ส่งซ้ำ" };
    const first = await traced("u_thana", [pressed("p5", "pin_widget", input)]);
    const answer = approvalAnswer(first.raw, true, (signature) => signature);
    await traced("u_thana", [pressed("p5", "pin_widget", input), answer]);
    const before = auditLog().all().length;
    const replayRunId = crypto.randomUUID();
    const replay = await serveChat(accessOf("u_thana"), request([pressed("p5", "pin_widget", input), answer], { threadId: "harness-thread" }), handlerFor, replayRunId);
    expect(replay.status).toBe(409);
    expect(auditLog().all().length).toBe(before);
    expect(runStore().get(replayRunId)?.events.at(-1)).toMatchObject({ type: "agent.failed" });
  });

  test("approval borrowed: one person's signed answer cannot run in another person's session", async () => {
    const input = { ...PIN_INPUT, title: "การ์ดของคนอื่น" };
    const first = await traced("u_thana", [pressed("p6", "pin_widget", input)]);
    const answer = approvalAnswer(first.raw, true, (signature) => signature);
    const before = auditLog().all().length;
    const borrowed = await serveChat(accessOf("u_krit"), request([pressed("p6", "pin_widget", input), answer], { threadId: "harness-thread" }), handlerFor);
    expect(borrowed.status).toBe(409);
    expect(auditLog().all().length).toBe(before);
  });

  test("approval forged: an approved answer without the server's signature never reaches the tool", async () => {
    const first = await traced("u_thana", [pressed("p3", "pin_widget", { ...PIN_INPUT, title: "การ์ดปลอม" })]);
    const forged = approvalAnswer(first.raw, true, () => undefined);
    const before = auditLog().all().length;
    const second = await traced("u_thana", [pressed("p3", "pin_widget", { ...PIN_INPUT, title: "การ์ดปลอม" }), forged]);
    expect(auditLog().all().length).toBe(before);
    expect(typesOf(second.events)).not.toContain("tool.started");
    expect(second.state.phase).toBe("failed");
  });

  test("UI action outside the role: a sales rep pressing create_handoff never reaches the tool", async () => {
    const before = auditLog().all().length;
    const { events, state } = await traced("u_krit", [pressed("p4", "create_handoff", { toUserId: "u_anucha", title: "x", ask: "x", urgency: "low", evidence: [], alertIds: [] })]);
    expect(typesOf(events)).toContain("ui.action");
    expect(Object.values(state.toolCalls).map((call) => call.tool)).not.toContain("create_handoff");
    expect(auditLog().all().slice(before).some((row) => row.tool === "create_handoff" && row.decision === "allow")).toBe(false);
  });
});

describe("harness scenarios: writes are verified, not trusted", () => {
  test("write operation: a real pin passes every post-condition", async () => {
    const pin = winyuTool("pin_widget")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    const { run, result } = await inRun("u_anucha", () => pin({ ...PIN_INPUT, query: { ...PIN_INPUT.query, filters: { region: ["northeast"] } } }, { toolCallId: "pin-real" }));
    expect(result).toMatchObject({ ok: true });
    expect(run.events.find((event) => event.type === "verification.passed")?.payload).toMatchObject({ checks: ["widget_exists", "widget_pinned", "widget_as_asked", "widget_in_scope"] });
  });

  test("verification failure on a write: a pin that says it worked but left no card is reported as not done", async () => {
    const lying = gated(capabilityOf("pin_widget"), async () => ({ ok: true, summary: "ปักแล้ว", data: { widgetId: "no-such-widget" } }));
    const { run, result } = await inRun("u_anucha", () => lying(PIN_INPUT, { toolCallId: "pin-lie" }));
    expect(result).toMatchObject({ ok: false, code: "VERIFICATION_FAILED" });
    expect((result as { error: string }).error).toContain("อย่าบอกว่าสำเร็จ");
    expect(stateOf(run.id, run.events).toolCalls["pin-lie"]).toMatchObject({ status: "withheld", verified: false, attempts: 1 });
  });
});

function eventOf<Type extends HarnessEventType>(events: HarnessEvent[], type: Type): Extract<HarnessEvent, { type: Type }> | undefined {
  return events.find((event): event is Extract<HarnessEvent, { type: Type }> => event.type === type);
}

describe("harness scenarios: governance", () => {
  test("wrong scope: an RSM asking about another region gets a failed observation the model must report, and no retry", async () => {
    const { events, state } = await traced("u_anucha", [userMessage("g1", "ยอดขายภาคใต้")]);
    expect(typesOf(events)).toEqual([
      "agent.started", "context.composed",
      "agent.thinking", "agent.tool.requested", "agent.decided",
      "tool.authorized", "tool.started", "tool.failed", "observation.created", "recovery.decided",
      "agent.thinking", "agent.decided", "agent.completed",
    ]);
    expect(eventOf(events, "observation.created")?.payload).toMatchObject({ status: "failed", evidence: { code: "PERMISSION_DENIED", rows: 0 } });
    expect(eventOf(events, "recovery.decided")?.payload).toMatchObject({ action: "return" });
    expect(state.goal?.status).toBe("completed");
  });

  test("masked metric: a sales rep's salary answer is observed as partial, checked for hidden numbers, and drawn masked", async () => {
    const { events, raw } = await traced("u_krit", [userMessage("g2", "เงินเดือนเฉลี่ยแต่ละฝ่าย")]);
    expect(eventOf(events, "observation.created")?.payload).toMatchObject({ status: "partial", evidence: { masked: ["value", "compare_value", "delta_pct"] } });
    expect(eventOf(events, "verification.passed")?.payload?.checks).toContain("masked_fields_hidden");
    expect(raw).toContain("***");
  });

  test("denied tool: a tool outside the role is refused by the gateway with its own event and an audit row, whoever calls it", async () => {
    const handoff = winyuTool("create_handoff")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    const { run, result } = await inRun("u_krit", () => handoff({ toUserId: "u_anucha", title: "x", ask: "x", urgency: "low", evidence: [], alertIds: [] }, { toolCallId: "denied-1" }));
    expect(result).toMatchObject({ ok: false, code: "TOOL_NOT_ALLOWED" });
    expect(typesOf(run.events)).toEqual(["tool.denied"]);
    expect(auditLog().all().find((row) => row.toolCallId === "denied-1")).toMatchObject({ decision: "deny", code: "TOOL_NOT_ALLOWED" });
  });

  test("run limit: once a run has spent its tool budget, the next call is refused and the model is told to summarize", async () => {
    const list = winyuTool("list_metrics")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    const run = newRun("u_thana", "harness-thread");
    run.toolCalls = 12;
    const result = await runWithAccess(accessOf("u_thana"), () => runWithRun(run, () => list({ search: null }, { toolCallId: "budget-1" })));
    expect(result).toMatchObject({ ok: false, code: "RUN_LIMIT" });
    expect(eventOf(run.events, "tool.denied")?.payload).toMatchObject({ code: "RUN_LIMIT" });
  });

  test("cross-user leakage: a packet addressed to someone else, preloaded by its id, never enters this user's context", async () => {
    const packet = packets().put({
      id: "pkt-harness-foreign",
      fromUserId: "u_thana",
      toUserId: "u_pim",
      title: "งบลับของฝ่ายการตลาด",
      ask: "ตรวจงบลับ",
      urgency: "low",
      evidence: [],
      alertIds: [],
      conversationDigest: "",
      suggestedActions: [],
      status: "sent",
      createdAt: new Date().toISOString(),
      sla: null,
      threadId: null,
    } as unknown as Parameters<ReturnType<typeof packets>["put"]>[0]);
    const own = packets().put({ ...packet, id: "pkt-harness-own", toUserId: "u_anucha" });
    try {
      const foreign = await traced("u_anucha", [userMessage("g5", "ยอดขายภาคอีสาน")], { preloadPacketId: packet.id });
      const addressed = await traced("u_anucha", [userMessage("g6", "ยอดขายภาคอีสาน")], { preloadPacketId: own.id });
      expect(eventOf(foreign.events, "context.composed")?.payload?.items.map((item) => item.id)).not.toContain(`packet:${packet.id}`);
      expect(eventOf(addressed.events, "context.composed")?.payload?.items.map((item) => item.id)).toContain(`packet:${own.id}`);
    } finally {
      packets().remove(packet.id);
      packets().remove(own.id);
    }
  });
});

type ModelChunk = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never;

const ZERO_USAGE = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
const WRAP_UP_TEXT = "สรุปจากที่ได้มา";

function keepsCallingTools(toolChoices: unknown[]) {
  return new MockLanguageModelV3({
    doStream: async (options) => {
      toolChoices.push(options.toolChoice);
      const call = toolChoices.length;
      const chunks: ModelChunk[] = options.toolChoice?.type === "none"
        ? [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: WRAP_UP_TEXT }, { type: "text-end", id: "t" }, { type: "finish", usage: ZERO_USAGE, finishReason: { unified: "stop", raw: "stop" } }]
        : [{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: `loop-${call}`, toolName: "list_metrics", input: JSON.stringify({ search: null }) }, { type: "finish", usage: ZERO_USAGE, finishReason: { unified: "tool-calls", raw: "tool-calls" } }];
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
}

function loopEngine(access: AccessContext, toolChoices: unknown[], prepareStep: HostPrepareStep | undefined): AgentEngine {
  const model = wrapLanguageModel({ model: keepsCallingTools(toolChoices), middleware: traceMiddleware() });
  return vexaEngine({ models: { loop: { model: () => model, name: "loop", maxTokens: 8_000 } }, tools: toolsForAccess(access), toolTiers: toolTiers(), stopWhen: stepCountIs(LIMITS.maxSteps), prepareStep }, "loop-secret");
}

async function looped(prepareStep: HostPrepareStep | undefined) {
  const access = accessOf("u_thana");
  const toolChoices: unknown[] = [];
  const runId = crypto.randomUUID();
  const body = { id: "loop-thread", model: "loop", context: { threadId: "loop-thread" }, messages: [userMessage("l1", "วิเคราะห์ทุกอย่าง")] };
  const response = await serveChat(access, new Request(CHAT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), () => loopEngine(access, toolChoices, prepareStep), runId);
  const raw = await response.text();
  return { raw, toolChoices, events: runStore().get(runId)?.events ?? [] };
}

describe("harness scenarios: the run's limits", () => {
  test("without the wrap-up hook, a model that keeps calling tools hits the step limit and the person gets no answer", async () => {
    const { raw, toolChoices } = await looped(undefined);
    expect(toolChoices).toHaveLength(LIMITS.maxSteps);
    expect(raw).not.toContain("text-delta");
  });

  test("with it, the last allowed model call has no tools, the reply ends in a summary, and the trace says why", async () => {
    const { raw, toolChoices, events } = await looped(wrapUpAtLimit());
    expect(toolChoices).toHaveLength(LIMITS.maxSteps);
    expect(toolChoices.at(-1)).toEqual({ type: "none" });
    expect(toolChoices.slice(0, -1).every((choice) => (choice as { type?: string })?.type !== "none")).toBe(true);
    expect(partsOf(raw).filter((part) => part.type === "text-delta").map((part) => String(part.delta)).join("")).toBe(WRAP_UP_TEXT);
    expect(eventOf(events, "agent.limited")?.payload).toEqual({ limit: "steps", step: LIMITS.maxSteps });
    expect(eventOf(events, "agent.completed")?.payload).toEqual({ finishReason: "stop" });
  });

  test("once the tool budget is spent, the next model call is told to wrap up even before the last step", () => {
    const run = newRun("u_thana", null);
    run.toolCalls = run.toolBudget;
    const result = runWithRun(run, () => wrapUpAtLimit()({ stepNumber: 2, system: "BASE", steps: [], messages: [], model: keepsCallingTools([]), experimental_context: undefined }));
    expect(result).toMatchObject({ toolChoice: "none" });
    expect((result as { system: string }).system.startsWith("BASE\n")).toBe(true);
    expect(eventOf(run.events, "agent.limited")?.payload).toEqual({ limit: "tool_calls", step: 3 });
  });

  test("a run inside its limits is left alone", () => {
    const run = newRun("u_thana", null);
    expect(runWithRun(run, () => wrapUpAtLimit()({ stepNumber: 1, system: "BASE", steps: [], messages: [], model: keepsCallingTools([]), experimental_context: undefined }))).toBeUndefined();
    expect(run.events).toEqual([]);
  });
});

const MARGIN_BY_BRAND = { metric: "gross_margin", dims: ["brand"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: 10, sort: null, where: null };

describe("harness scenarios: the model is told how to fix a refused call", () => {
  test("a query on a dimension the metric lacks comes back with the dimensions and comparisons it has", async () => {
    const query = winyuTool("query_metric")?.tool.execute as (input: unknown, options: unknown) => Promise<{ ok: boolean; code: string; fix?: string }>;
    const { run, result } = await inRun("u_siriporn", () => query(MARGIN_BY_BRAND, { toolCallId: "fix-1" }));
    const answer = result as { ok: boolean; code: string; fix?: string };
    expect(answer).toMatchObject({ ok: false, code: "BAD_QUERY" });
    expect(answer.fix).toContain("gross_margin");
    expect(answer.fix).toContain("region");
    expect(answer.fix).not.toContain("target");
    expect(answer.fix).toContain("list_metrics");
    expect(eventOf(run.events, "recovery.decided")?.payload).toMatchObject({ action: "correct", fix: answer.fix });
    expect(run.corrections.query_metric).toBe(1);
  });

  test("after two fixes the model is told to stop and explain, not handed a third", async () => {
    const query = winyuTool("query_metric")?.tool.execute as (input: unknown, options: unknown) => Promise<{ fix?: string }>;
    const { run } = await inRun("u_siriporn", async () => {
      for (const id of ["a", "b", "c"]) await query(MARGIN_BY_BRAND, { toolCallId: `fix-loop-${id}` });
      return null;
    });
    const decisions = run.events.flatMap((event) => (event.type === "recovery.decided" ? [event.payload] : []));
    expect(decisions.map((decision) => decision.action)).toEqual(["correct", "correct", "return"]);
    expect(decisions[2].fix).toBe(TH.harness.stopCorrecting);
  });

  test("a refusal the model cannot fix gets no hint: another region stays a plain PERMISSION_DENIED", async () => {
    const query = winyuTool("query_metric")?.tool.execute as (input: unknown, options: unknown) => Promise<{ code?: string; fix?: string }>;
    const { result } = await inRun("u_anucha", () => query({ ...MARGIN_BY_BRAND, metric: "net_sales_volume", dims: ["region"], filters: { region: ["south"] } }, { toolCallId: "no-fix" }));
    expect(result).toMatchObject({ code: "PERMISSION_DENIED" });
    expect((result as { fix?: string }).fix).toBeUndefined();
  });
});

const SECRET_BODY = "เงินเดือนของคุณสมชายปีหน้าจะขึ้นเป็น 85,000 บาท";
const SECRET_REASON = "ไปผ่าตัดที่โรงพยาบาล";

function auditRowOf(toolCallId: string) {
  const row = auditLog().all().find((entry) => entry.toolCallId === toolCallId);
  if (!row) throw new Error(`no audit row for ${toolCallId}`);
  return row;
}

describe("harness scenarios: what the audit keeps", () => {
  test("personal text a tool declares (an email body, a leave reason) never reaches the audit, while the rest of the call stays readable", async () => {
    const email = winyuTool("send_email")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    const leave = winyuTool("request_leave")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    await inRun("u_thana", () => email({ toUserId: "u_siriporn", subject: "เรื่องเงินเดือน", body: SECRET_BODY }, { toolCallId: "redact-email" }));
    await inRun("u_krit", () => leave({ kind: "sick", from: "2026-10-06", to: "2026-10-06", reason: SECRET_REASON }, { toolCallId: "redact-leave" }));
    const rows = [auditRowOf("redact-email"), auditRowOf("redact-leave")];
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(SECRET_BODY.slice(0, 20));
    expect(stored).not.toContain("เรื่องเงินเดือน");
    expect(stored).not.toContain(SECRET_REASON);
    expect(rows[0].args).toContain("u_siriporn");
    expect(rows[0].args).toContain(TH.admin.auditTab.redacted);
    expect(rows[1].args).toContain("2026-10-06");
  });

  test("a call a person started is marked person and tied to their run", async () => {
    const list = winyuTool("list_metrics")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    const { run } = await inRun("u_thana", () => list({ search: null }, { toolCallId: "by-person" }));
    expect(auditRowOf("by-person")).toMatchObject({ initiator: "person", turnId: run.id });
  });

  test("a background job's calls are marked job and tied to the job's own run, so the admin can tell them from the person's", async () => {
    const list = winyuTool("list_metrics")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    await runWithAccess(accessOf("u_anucha"), () => tracedRun("u_anucha", { userMessage: "job", intent: "job:test" }, 5, () => list({ search: null }, { toolCallId: "by-job" })));
    const row = auditRowOf("by-job");
    expect(row.initiator).toBe("job");
    expect(runStore().get(row.turnId ?? "")?.events[0]).toMatchObject({ type: "agent.started", payload: { goal: { intent: "job:test" } } });
  });

  test("a call from server code outside any run is marked system", async () => {
    const list = winyuTool("list_metrics")?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
    await runWithAccess(accessOf("u_thana"), () => list({ search: null }, { toolCallId: "by-system" }));
    expect(auditRowOf("by-system").initiator).toBe("system");
  });
});
