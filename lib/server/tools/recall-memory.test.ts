import { afterEach, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { forgetConversations, indexTurn } from "@/lib/harness/adapters/mastra/recall";
import { TH } from "@/lib/i18n/th";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { threadForRun, threads } from "@/lib/server/threads-read";
import { recallMemoryTool } from "./recall-memory";

const USER = "u_may";
const QUESTION = "อัตราการลาออกแต่ละฝ่ายเป็นยังไง";
const PAST = "t_recall_tool_past";
const NOW = "t_recall_tool_now";

type Recalled = { summary: string; conversations: { threadId: string; question: string; reply: string }[] };

function turnOn(threadId: string): TurnContext {
  return { turnId: "run_recall_tool", threadId, preloadPacketId: null, question: "ครั้งก่อนเรื่องคนลาออก", queries: [] };
}

async function recallOn(threadId: string): Promise<Recalled> {
  const user = findUser(USER);
  if (!user) throw new Error(`missing demo user ${USER}`);
  return runWithAccess(accessFor(user), () => runWithTurn(turnOn(threadId), () => recallMemoryTool.execute({ query: "ครั้งก่อนที่คุยเรื่องคนลาออก" }))) as Promise<Recalled>;
}

afterEach(async () => {
  await forgetConversations(USER);
  for (const id of [PAST, NOW]) threads().remove(id);
});

describe("recall_memory", () => {
  test("returns the person's past conversation, masked, and not the conversation being had", async () => {
    threadForRun(PAST, USER, QUESTION);
    threadForRun(NOW, USER, QUESTION);
    await indexTurn({ userId: USER, threadId: PAST, turnId: "past_1", at: "2026-09-20T03:00:00.000Z", question: QUESTION, reply: "ฝ่ายขายลาออก 12% สูงสุด", queries: [] });
    await indexTurn({ userId: USER, threadId: NOW, turnId: "now_1", at: "2026-09-22T03:00:00.000Z", question: QUESTION, reply: "ฝ่ายผลิตสูงสุด", queries: [] });
    const result = await recallOn(NOW);
    expect(result.conversations.map((found) => found.threadId)).toEqual([PAST]);
    expect(result.conversations[0]?.reply).toBe(`ฝ่ายขายลาออก ${TH.memory.maskedNumber}% สูงสุด`);
    expect(result.summary).toContain("1 บทสนทนา");
  });
});
