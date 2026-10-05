import { afterEach, describe, expect, test } from "bun:test";
import type { MetricQuery } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { RecallTurn } from "@/lib/server/recall/types";
import { threadForRun, threads } from "@/lib/server/threads-read";
import { forgetConversation, forgetConversations, indexTurn, recallableThreads, searchConversations } from "./recall";

const USER = "u_recall_test";
const OTHER = "u_recall_other";
const ATTRITION_QUERY: MetricQuery = { metric: "attrition_rate", dims: ["department"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null };

let turnCount = 0;

function turn(userId: string, threadId: string, question: string, reply: string, queries: MetricQuery[] = []): RecallTurn {
  turnCount += 1;
  threadForRun(threadId, userId, question);
  return { userId, threadId, turnId: `turn_${turnCount}`, at: new Date(Date.UTC(2026, 8, turnCount)).toISOString(), question, reply, queries };
}

afterEach(async () => {
  await forgetConversations(USER);
  await forgetConversations(OTHER);
  for (const thread of threads().where((item) => item.userId === USER || item.userId === OTHER)) threads().remove(thread.id);
});

describe("conversation recall", () => {
  test("finds the person's own earlier conversation with its numbers masked and its queries kept", async () => {
    await indexTurn(turn(USER, "t_attrition", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายลาออก 12.5% สูงสุด", [ATTRITION_QUERY]));
    await indexTurn(turn(USER, "t_stock", "สต๊อกดีซีลำพูนพอขายกี่วัน", "พอขาย 9 วัน"));
    const [found] = await searchConversations(USER, "ครั้งก่อนที่คุยเรื่องอัตราการลาออก");
    expect(found?.threadId).toBe("t_attrition");
    expect(found?.question).toBe("อัตราการลาออกแต่ละฝ่ายเป็นยังไง");
    expect(found?.reply).toBe(`ฝ่ายขายลาออก ${TH.memory.maskedNumber}% สูงสุด`);
    expect(found?.queries).toEqual([ATTRITION_QUERY]);
  });

  test("never returns another person's conversation, the current thread, or a deleted thread", async () => {
    await indexTurn(turn(OTHER, "t_other", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายสูงสุด"));
    await indexTurn(turn(USER, "t_now", "อัตราการลาออกแต่ละฝ่าย", "ฝ่ายผลิตสูงสุด"));
    await indexTurn(turn(USER, "t_gone", "อัตราการลาออกรายเดือน", "ทรงตัว"));
    threads().remove("t_gone");
    expect(await searchConversations(USER, "อัตราการลาออก", { excludeThreadId: "t_now" })).toEqual([]);
  });

  test("indexing a turn twice keeps one entry, one thread comes back once, and listing counts its turns", async () => {
    const first = turn(USER, "t_sales", "ยอดขายภาคอีสานเดือนนี้", "ต่ำกว่าเป้า");
    await indexTurn(first);
    await indexTurn(first);
    await indexTurn(turn(USER, "t_sales", "ยอดขายภาคอีสานแยกจังหวัด", "ขอนแก่นนำ"));
    expect((await searchConversations(USER, "ยอดขายภาคอีสาน")).map((found) => found.threadId)).toEqual(["t_sales"]);
    expect(await recallableThreads(USER)).toEqual([{ threadId: "t_sales", title: "ยอดขายภาคอีสานเดือนนี้", turns: 2, lastAt: new Date(Date.UTC(2026, 8, turnCount)).toISOString() }]);
  });

  test("forgetting one conversation leaves the thread and the person's other conversations", async () => {
    await indexTurn(turn(USER, "t_keep", "ลูกหนี้ค้างชำระแยกภาค", "ภาคใต้สูงสุด"));
    await indexTurn(turn(USER, "t_drop", "ลูกหนี้ค้างชำระแยกเอเย่นต์", "เอเย่นต์ภาคใต้สูงสุด"));
    await indexTurn(turn(OTHER, "t_drop_other", "ลูกหนี้ค้างชำระแยกเอเย่นต์", "ภาคเหนือ"));
    await forgetConversation(USER, "t_drop");
    expect((await recallableThreads(USER)).map((thread) => thread.threadId)).toEqual(["t_keep"]);
    expect(threads().get("t_drop")).toBeDefined();
    expect((await recallableThreads(OTHER)).map((thread) => thread.threadId)).toEqual(["t_drop_other"]);
    await forgetConversations(USER);
    expect(await recallableThreads(USER)).toEqual([]);
  });
});
