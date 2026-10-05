import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emitTo, newRun, type RunRecord } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { RunTrace } from "./run-trace";

const COPY = TH.admin.trace;
const GOAL = { id: "g", userMessage: "ยอดขายภาคใต้", intent: null, status: "active" as const };

function recordOf(build: (run: ReturnType<typeof newRun>) => void): RunRecord {
  const run = newRun("u_anucha", "t");
  build(run);
  return { id: run.id, userId: run.userId, threadId: run.threadId, startedAt: run.events[0].at, endedAt: run.events.at(-1)?.at ?? run.events[0].at, events: run.events };
}

describe("RunTrace", () => {
  test("a withheld answer shows the failed check, its reason and that the result never reached the AI", () => {
    const ref = { toolCallId: "c1", tool: "query_metric" };
    const record = recordOf((run) => {
      emitTo(run, "runtime", { type: "agent.started", payload: { goal: GOAL, userId: "u_anucha", threadId: "t" } });
      emitTo(run, "gateway", { type: "tool.authorized", payload: { ...ref, approval: "never" } });
      emitTo(run, "gateway", { type: "tool.started", payload: { ...ref, attempt: 1 } });
      emitTo(run, "gateway", { type: "tool.completed", payload: { ...ref, attempt: 1, latencyMs: 5 } });
      emitTo(run, "gateway", { type: "observation.created", payload: { ...ref, observationId: "o", status: "success", evidence: { code: null, reason: null, rows: 1, masked: [] } } });
      emitTo(run, "gateway", { type: "verification.failed", payload: { ...ref, reason: "a row outside the caller's scope: region ภาคใต้ is in south", retry: false } });
      emitTo(run, "gateway", { type: "recovery.decided", payload: { ...ref, action: "withhold", reason: "post-condition broken" } });
      emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: "stop" } });
    });
    const html = renderToStaticMarkup(<RunTrace record={record} audit={[{ id: "a", at: record.startedAt, userId: "u_anucha", tool: "query_metric", argsHash: "h", decision: "deny", rowsReturned: 0, latencyMs: 5, toolCallId: "c1", args: '{"region":"south"}' }]} />);
    expect(html).toContain(COPY.unverified);
    expect(html).toContain("region ภาคใต้ is in south");
    expect(html).toContain(COPY.recovery.withhold);
    expect(html).toContain("{&quot;region&quot;:&quot;south&quot;}");
  });

  test("a refused tool shows that the system refused it and why", () => {
    const record = recordOf((run) => {
      emitTo(run, "runtime", { type: "agent.started", payload: { goal: GOAL, userId: "u_krit", threadId: "t" } });
      emitTo(run, "gateway", { type: "tool.denied", payload: { toolCallId: "c2", tool: "create_handoff", code: "TOOL_NOT_ALLOWED", reason: "บทบาทของคุณใช้เครื่องมือนี้ไม่ได้" } });
      emitTo(run, "runtime", { type: "agent.failed", payload: { reason: "stopped" } });
    });
    const html = renderToStaticMarkup(<RunTrace record={record} audit={[]} />);
    expect(html).toContain(COPY.gate.denied);
    expect(html).toContain("บทบาทของคุณใช้เครื่องมือนี้ไม่ได้");
    expect(html).toContain(COPY.phase.failed);
  });

  test("a call an admin rule refused names the rule and links to where rules are edited", () => {
    const record = recordOf((run) => {
      emitTo(run, "runtime", { type: "agent.started", payload: { goal: GOAL, userId: "u_thana", threadId: "t" } });
      emitTo(run, "gateway", { type: "tool.denied", payload: { toolCallId: "c3", tool: "send_email", code: "POLICY_RULE", reason: "ปฏิเสธตามกฎ", rule: { id: "r1", name: "ห้ามส่งเรื่องเงินเดือนทางอีเมล" } } });
      emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: "stop" } });
    });
    const html = renderToStaticMarkup(<RunTrace record={record} audit={[]} />);
    expect(html).toContain(COPY.rule("ห้ามส่งเรื่องเงินเดือนทางอีเมล"));
    expect(html).toContain('href="/admin?tab=rules"');
  });

  test("a run that reached its step limit says the AI was told to sum up", () => {
    const record = recordOf((run) => {
      emitTo(run, "runtime", { type: "agent.started", payload: { goal: GOAL, userId: "u_thana", threadId: "t" } });
      emitTo(run, "runtime", { type: "agent.limited", payload: { limit: "steps", step: 6 } });
      emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: "stop" } });
    });
    const html = renderToStaticMarkup(<RunTrace record={record} audit={[]} />);
    expect(html).toContain(COPY.limited.steps);
    expect(html).toContain(COPY.limitedDetail(6));
  });
});
