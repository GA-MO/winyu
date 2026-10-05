import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { MetricQuery } from "@/lib/contracts";
import { actionEvents, memoryFacts } from "@/lib/server/agent/collections";
import { auditLog } from "@/lib/server/audit";
import { threadForRun, threads } from "@/lib/server/threads-read";
import { mascopAgent } from "./agent";
import { forgetThread } from "./history";
import { latestReplyText, learnFromTurn } from "./learn";
import { forgetConversations, searchConversations } from "./recall";

const USER = "u_learn_test";
const THREAD = "t_learn_test";
const OLD_QUESTION = "สต๊อกดีซีลำพูนเป็นยังไง";
const QUESTION = "อัตราการลาออกแต่ละฝ่ายเป็นยังไง";
const REPLY = "ฝ่ายขายลาออกสูงสุดในเดือนนี้";
const ATTRITION: MetricQuery = { metric: "attrition_rate", dims: ["department"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: null };

async function say(role: "user" | "assistant", text: string): Promise<void> {
  const memory = await mascopAgent().getMemory();
  if (!memory) throw new Error("the chat agent has no memory");
  const content = { format: 2 as const, parts: [{ type: "text" as const, text }] };
  await memory.saveMessages({ messages: [{ id: randomUUID(), role, createdAt: new Date(), threadId: THREAD, resourceId: USER, type: "text", content }] });
}

async function openThread(): Promise<void> {
  const memory = await mascopAgent().getMemory();
  if (!memory) throw new Error("the chat agent has no memory");
  const now = new Date();
  await memory.saveThread({ thread: { id: THREAD, resourceId: USER, title: QUESTION, createdAt: now, updatedAt: now } });
  threadForRun(THREAD, USER, QUESTION);
}

afterEach(async () => {
  await forgetThread(THREAD, USER);
  await forgetConversations(USER);
  for (const thread of threads().where((item) => item.userId === USER)) threads().remove(thread.id);
  for (const fact of memoryFacts().where((item) => item.userId === USER)) memoryFacts().remove(fact.id);
  for (const event of actionEvents().where((item) => item.userId === USER)) actionEvents().remove(event.id);
});

describe("learnFromTurn", () => {
  test("the reply to the latest question is read without earlier turns", async () => {
    await openThread();
    await say("user", OLD_QUESTION);
    await say("assistant", "พอขายอีกหลายวัน");
    await say("user", QUESTION);
    await say("assistant", REPLY);
    expect(await latestReplyText(THREAD, USER)).toBe(REPLY);
  });

  test("a finished turn is logged and becomes findable from another thread with its reply", async () => {
    await openThread();
    await say("user", QUESTION);
    await say("assistant", REPLY);
    await learnFromTurn({ userId: USER, threadId: THREAD, turnId: "run_learn_1", question: QUESTION, queries: [] });
    expect(actionEvents().where((event) => event.userId === USER && event.prompt === QUESTION)).toHaveLength(1);
    const [found] = await searchConversations(USER, "เรื่องคนลาออกครั้งก่อน");
    expect(found).toMatchObject({ threadId: THREAD, question: QUESTION, reply: REPLY });
  });

  test("a turn the agent wrote no words for is not indexed", async () => {
    await openThread();
    await say("user", QUESTION);
    await learnFromTurn({ userId: USER, threadId: THREAD, turnId: "run_learn_2", question: QUESTION, queries: [] });
    expect(await searchConversations(USER, QUESTION)).toEqual([]);
  });

  test("learning from a finished turn reuses the queries it ran and calls no tool", async () => {
    await openThread();
    await say("user", QUESTION);
    await say("assistant", REPLY);
    const audited = auditLog().all().length;
    await learnFromTurn({ userId: USER, threadId: THREAD, turnId: "run_learn_3", question: QUESTION, queries: [ATTRITION] });
    expect(auditLog().all().length).toBe(audited);
    const [found] = await searchConversations(USER, "เรื่องคนลาออกครั้งก่อน");
    expect(found?.queries).toEqual([ATTRITION]);
  });
});
