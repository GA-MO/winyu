import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { askedAgain, durationsAfter, failureOf, runStartedAt, unansweredOf, type PendingApproval } from "./use-chat-session";

function asked(toolCallId: string): PendingApproval {
  return { interruptId: `mastra-approval::run::${toolCallId}`, toolCallId, tool: "send_card", input: {}, exchangeId: "q1", position: 0 };
}

type Held = Parameters<typeof unansweredOf>[2][number];

function held(toolCallId: string): Held {
  return { id: `mastra-approval::run::${toolCallId}`, reason: "tool_approval", toolCallId };
}

describe("a question sent while an approval waits", () => {
  test("declines every approval the person has not decided, and any interrupt the agent still holds, and none they already answered", () => {
    const batch = [asked("c-open"), asked("c-decided")];
    const unanswered = unansweredOf(batch, { "c-decided": true }, [held("c-open"), held("c-restored")]);
    expect(unanswered).toEqual([
      { interruptId: "mastra-approval::run::c-open", toolCallId: "c-open" },
      { interruptId: "mastra-approval::run::c-restored", toolCallId: "c-restored" },
    ]);
  });

  test("with nothing waiting, the question runs on its own", () => {
    expect(unansweredOf([], {}, [])).toEqual([]);
  });
});

describe("the time shown for a turn", () => {
  test("counts a run the page joined after a reload from when the run started, not from the rejoin", () => {
    const live = { id: "run-live", startedAt: 1_000 };
    expect(runStartedAt("run-live", live, 29_000)).toBe(1_000);
    expect(runStartedAt("run-other", live, 29_000)).toBe(29_000);
    expect(runStartedAt("run-live", null, 29_000)).toBe(29_000);
  });

  test("keeps the asking run's time when a run only carries out the answer to its approval", () => {
    expect(durationsAfter({ q1: 8000 }, "q1", 11000, true)).toEqual({ q1: 8000 });
  });

  test("adds the time of a run that answers a question", () => {
    expect(durationsAfter({ q1: 8000 }, "q2", 3000, false)).toEqual({ q1: 8000, q2: 3000 });
  });
});

describe("a run that ended without an answer", () => {
  test("a run the server gave up on reads as timed out and may be asked again; signed out and a spent approval may not", () => {
    expect(failureOf("Model call timed out after 60000ms (modelSettings.timeout.stepMs)")).toEqual({ text: TH.conversation.timedOut, retryable: true });
    expect(failureOf(new Error("network down"))).toEqual({ text: TH.conversation.failed, retryable: true });
    expect(failureOf(new Error("HTTP 401"))).toMatchObject({ retryable: false });
    expect(failureOf(new Error("HTTP 409"))).toMatchObject({ retryable: false });
  });

  test("asking again keeps the transcript up to the last question, so what the failed run left goes and the question is not sent twice", () => {
    const messages = [
      { id: "q1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "q2", role: "user" },
      { id: "partial", role: "assistant" },
      { id: "call", role: "tool" },
    ];
    expect(askedAgain(messages)?.map((message) => message.id)).toEqual(["q1", "a1", "q2"]);
    expect(askedAgain([{ id: "a0", role: "assistant" }])).toBeNull();
  });
});
