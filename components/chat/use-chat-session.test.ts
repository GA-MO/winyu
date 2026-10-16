import { describe, expect, test } from "bun:test";
import { durationsAfter, unansweredOf, type PendingApproval } from "./use-chat-session";

function asked(toolCallId: string): PendingApproval {
  return { interruptId: `mastra-approval::run::${toolCallId}`, toolCallId, tool: "share_card", input: {}, exchangeId: "q1", position: 0 };
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
  test("keeps the asking run's time when a run only carries out the answer to its approval", () => {
    expect(durationsAfter({ q1: 8000 }, "q1", 11000, true)).toEqual({ q1: 8000 });
  });

  test("adds the time of a run that answers a question", () => {
    expect(durationsAfter({ q1: 8000 }, "q2", 3000, false)).toEqual({ q1: 8000, q2: 3000 });
  });
});
