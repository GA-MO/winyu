import { describe, expect, test } from "bun:test";
import { unansweredOf, type PendingApproval } from "./use-chat-session";

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
