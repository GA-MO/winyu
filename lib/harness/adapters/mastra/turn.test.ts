import { describe, expect, test } from "bun:test";
import { chatTurnOf, observeReply, seenOf, type ReplySeen, type RunInput } from "./turn";

const THREAD = "t-1";
const QUESTION = { id: "m-1", role: "user", content: "ปักการ์ดยอดขายรายภาคไว้ที่แดชบอร์ด" };
const INTERRUPT_ID = "mastra-approval::run-ask::call_130458";

function input(runId: string, resume?: NonNullable<RunInput>["resume"]): RunInput {
  return { threadId: THREAD, runId, messages: [QUESTION], ...(resume ? { resume } : {}) };
}

describe("chatTurnOf", () => {
  test("the run that answers an approval continues the goal of the run that asked", () => {
    const asking = chatTurnOf(input("run-ask"), "fallback");
    const answering = chatTurnOf(input("run-answer", [{ interruptId: INTERRUPT_ID, status: "resolved", payload: { approved: true } }]), "fallback");
    expect(asking.runId).toBe("run-ask");
    expect(answering.runId).toBe("run-answer");
    expect(answering.goal.id).toBe(asking.goal.id);
    expect(asking.answers).toEqual([]);
    expect(answering.answers).toEqual([{ interruptId: INTERRUPT_ID, toolCallId: "call_130458", approved: true }]);
  });

  test("a declined or cancelled answer never reads as approved, and an id the server never raised is still an answer for the ledger to refuse", () => {
    const declined = chatTurnOf(input("r", [{ interruptId: INTERRUPT_ID, status: "resolved", payload: { approved: false } }]), "f");
    const cancelled = chatTurnOf(input("r", [{ interruptId: INTERRUPT_ID, status: "cancelled", payload: { approved: true } }]), "f");
    const suspend = chatTurnOf(input("r", [{ interruptId: "run-ask::call_130458", status: "resolved", payload: true }]), "f");
    expect(declined.answers[0]?.approved).toBe(false);
    expect(cancelled.answers[0]?.approved).toBe(false);
    expect(suspend.answers).toEqual([{ interruptId: "run-ask::call_130458", toolCallId: "call_130458", approved: true }]);
  });

  test("a body that is not a run request still yields a run id and no question", () => {
    const turn = chatTurnOf(null, "fallback");
    expect(turn.runId).toBe("fallback");
    expect(turn.question).toBeNull();
    expect(turn.threadId).toBeNull();
  });
});

describe("seenOf", () => {
  test("names each tool result by its call and reads approvals from the interrupt outcome", () => {
    const seen = seenOf([
      { type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "query_metric" },
      { type: "TOOL_CALL_RESULT", toolCallId: "c1" },
      { type: "TOOL_CALL_START", toolCallId: "c2", toolCallName: "pin_widget" },
      { type: "TEXT_MESSAGE_CONTENT" },
      { type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [{ id: INTERRUPT_ID, toolCallId: "c2", metadata: { mastra: { toolName: "pin_widget" } } }] } },
    ]);
    expect(seen).toEqual({ results: ["query_metric"], asked: [{ interruptId: INTERRUPT_ID, toolCallId: "c2", tool: "pin_widget" }], text: true, error: null });
  });

  test("the run that answers an approval names the receipt by the asked call, and a result no one started is left out instead of called unknown", () => {
    const seen = seenOf(
      [
        { type: "TOOL_CALL_RESULT", toolCallId: "asked" },
        { type: "TOOL_CALL_RESULT", toolCallId: "stranger" },
        { type: "TOOL_CALL_START", toolCallId: "c3", toolCallName: "query_metric" },
        { type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [{ id: INTERRUPT_ID, toolCallId: "c3" }] } },
      ],
      new Map([["asked", "enroll_course"]]),
    );
    expect(seen.results).toEqual(["enroll_course"]);
    expect(seen.asked).toEqual([{ interruptId: INTERRUPT_ID, toolCallId: "c3", tool: "query_metric" }]);
    expect(JSON.stringify(seen)).not.toContain("unknown");
  });

  test("a run error ends the reply as failed", () => {
    expect(seenOf([{ type: "RUN_ERROR", message: "boom" }]).error).toBe("boom");
  });
});

function sse(events: readonly object[]): Uint8Array {
  return new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
}

describe("observeReply", () => {
  test("a client that leaves after the first event does not end the reply: the harness still sees the result and the finish that came later", async () => {
    let finish: () => void = () => undefined;
    const later = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const source = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(sse([{ type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "query_metric" }]));
        await later;
        controller.enqueue(sse([{ type: "TOOL_CALL_RESULT", toolCallId: "c1" }, { type: "TEXT_MESSAGE_CONTENT" }, { type: "RUN_FINISHED" }]));
        controller.close();
      },
    });
    const ended = new Promise<ReplySeen>((resolve) => {
      const reply = observeReply(new Response(source), new Map(), resolve);
      const reader = reply.body?.getReader();
      void reader?.read().then(() => {
        void reader.cancel();
        finish();
      });
    });
    expect(await ended).toEqual({ results: ["query_metric"], asked: [], text: true, error: null });
  });
});
