import { afterEach, describe, expect, test } from "bun:test";
import type { MetricQuery } from "@/lib/contracts";
import { useEmbedder } from "@/lib/server/recall/embedder";
import { TRIGRAM_EMBEDDER } from "@/lib/server/recall/trigram-embedder";
import type { Embedder, RecallTurn } from "@/lib/server/recall/types";
import { threadForRun, threads } from "@/lib/server/threads-read";
import { forgetConversation, forgetConversations, forgetOrphanedConversations, forgetTurns, indexedTurns, indexTurn, prepareRecallIndex, recallableThreads, searchConversations } from "./recall";

const USER = "u_recall_test";
const OTHER = "u_recall_other";
const ATTRITION_QUERY: MetricQuery = { metric: "attrition_rate", dims: ["department"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null };

const WIDER_DIMENSION = 96;

const WIDER_EMBEDDER: Embedder = {
  id: "trigram-96",
  dimension: WIDER_DIMENSION,
  passages: async (texts) => (await TRIGRAM_EMBEDDER.passages(texts)).map(padded),
  query: async (text) => padded(await TRIGRAM_EMBEDDER.query(text)),
};

function padded(vector: number[]): number[] {
  return [...vector, ...new Array<number>(WIDER_DIMENSION - vector.length).fill(0)];
}

/** Scores fixed by text: a passage listed in `scores` meets the query at that cosine, every other text at none. */
function scoredEmbedder(scores: Record<string, number>): Embedder {
  const dimension = TRIGRAM_EMBEDDER.dimension;
  const at = (score: number) => [score, Math.sqrt(1 - score * score), ...new Array<number>(dimension - 2).fill(0)];
  return {
    id: "scored",
    dimension,
    passages: async (texts) => texts.map((text) => at(scores[text] ?? 0)),
    query: async () => at(1),
  };
}

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
  test("finds the person's own earlier conversation in their own words with its queries kept", async () => {
    await indexTurn(turn(USER, "t_attrition", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายลาออก 12.5% สูงสุด", [ATTRITION_QUERY]));
    await indexTurn(turn(USER, "t_stock", "สต๊อกดีซีลำพูนพอขายกี่วัน", "พอขาย 9 วัน"));
    const [found] = await searchConversations(USER, "ครั้งก่อนที่คุยเรื่องอัตราการลาออก");
    expect(found?.threadId).toBe("t_attrition");
    expect(found?.question).toBe("อัตราการลาออกแต่ละฝ่ายเป็นยังไง");
    expect(found?.reply).toBe("ฝ่ายขายลาออก 12.5% สูงสุด");
    expect(found?.queries).toEqual([ATTRITION_QUERY]);
  });

  test("never returns another person's conversation, the current thread, or a deleted thread", async () => {
    await indexTurn(turn(OTHER, "t_other", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายสูงสุด"));
    await indexTurn(turn(USER, "t_now", "อัตราการลาออกแต่ละฝ่าย", "ฝ่ายผลิตสูงสุด"));
    await indexTurn(turn(USER, "t_gone", "อัตราการลาออกรายเดือน", "ทรงตัว"));
    threads().remove("t_gone");
    expect(await searchConversations(USER, "อัตราการลาออก", { excludeThreadId: "t_now" })).toEqual([]);
  });

  test("vectors of threads whose record is gone stop taking search slots once cleared, and clearing again finds nothing", async () => {
    const asked = "หนี้ค้างชำระภาคใต้ตอนนี้เป็นยังไง";
    for (let index = 0; index < 7; index += 1) await indexTurn(turn(USER, `t_orphan_${index}`, asked, asked));
    await indexTurn(turn(USER, "t_live", "ลูกหนี้ค้างชำระภาคใต้แยกเอเย่นต์", "สงขลานำ"));
    for (let index = 0; index < 7; index += 1) threads().remove(`t_orphan_${index}`);
    expect(await searchConversations(USER, asked)).toEqual([]);
    expect(await forgetOrphanedConversations()).toBe(7);
    expect((await searchConversations(USER, asked)).map((found) => found.threadId)).toEqual(["t_live"]);
    expect(await forgetOrphanedConversations()).toBe(0);
  });

  test("an empty thread store clears no vectors, so a missing threads file never wipes everyone's recall", async () => {
    await indexTurn(turn(USER, "t_kept", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายสูงสุด"));
    const saved = threads().all();
    for (const thread of saved) threads().remove(thread.id);
    expect(await forgetOrphanedConversations()).toBe(0);
    for (const thread of saved) threads().put(thread);
    expect((await searchConversations(USER, "อัตราการลาออก")).map((found) => found.threadId)).toEqual(["t_kept"]);
  });

  test("a turn whose thread was deleted while it was being embedded is not indexed", async () => {
    const late = turn(USER, "t_deleted", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายสูงสุด");
    threads().remove("t_deleted");
    await indexTurn(late);
    expect(await forgetOrphanedConversations()).toBe(0);
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

  test("forgetting one turn takes its question and reply out of recall and leaves the thread's other turns", async () => {
    const asked = turn(USER, "t_turns", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายสูงสุด");
    const recalledOnly = turn(USER, "t_turns", "จำได้ไหมว่าคุยเรื่องลาออก", "เคยคุยเรื่องอัตราการลาออก");
    await indexTurn(asked);
    await indexTurn(recalledOnly);
    await forgetTurns([recalledOnly.turnId]);
    await forgetTurns([recalledOnly.turnId]);
    expect((await indexedTurns()).filter((found) => found.userId === USER).map((found) => found.turnId)).toEqual([asked.turnId]);
    expect((await recallableThreads(USER)).map((thread) => [thread.threadId, thread.turns])).toEqual([["t_turns", 1]]);
  });

  test("of two conversations that match almost equally the newer comes first, and a wider band lets a newer one a little further down lead (เมื่อกี้)", async () => {
    useEmbedder(scoredEmbedder({ "ลาออกเมื่อวาน": 0.9, "ลาออกวันนี้": 0.885, "ลาออกเมื่อเช้า": 0.87, "ลาออกบ่าย": 0.8 }));
    try {
      await indexTurn(turn(USER, "t_yesterday", "ลาออกเมื่อวาน", "-"));
      await indexTurn(turn(USER, "t_morning", "ลาออกเมื่อเช้า", "-"));
      await indexTurn(turn(USER, "t_today", "ลาออกวันนี้", "-"));
      await indexTurn(turn(USER, "t_afternoon", "ลาออกบ่าย", "-"));
      expect((await searchConversations(USER, "ลาออก", { limit: 4 })).map((found) => found.threadId)).toEqual(["t_today", "t_yesterday", "t_morning", "t_afternoon"]);
      expect((await searchConversations(USER, "ลาออก", { limit: 4, sameMatchBand: 0.04 })).map((found) => found.threadId)).toEqual(["t_today", "t_morning", "t_yesterday", "t_afternoon"]);
    } finally {
      await forgetConversations(USER);
      useEmbedder(TRIGRAM_EMBEDDER);
    }
  });

  test("an embedder of another vector size re-embeds the stored conversations instead of losing them", async () => {
    await indexTurn(turn(USER, "t_resize", "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", "ฝ่ายขายสูงสุด"));
    await indexTurn(turn(USER, "t_resize", "แยกตามเดือน", "ทรงตัว"));
    useEmbedder(WIDER_EMBEDDER);
    try {
      expect(await prepareRecallIndex()).toMatchObject({ dimension: WIDER_DIMENSION });
      expect((await searchConversations(USER, "ครั้งก่อนที่คุยเรื่องอัตราการลาออก"))[0]?.threadId).toBe("t_resize");
      expect((await recallableThreads(USER)).map((thread) => [thread.threadId, thread.turns])).toEqual([["t_resize", 2]]);
    } finally {
      await forgetConversations(USER);
      useEmbedder(TRIGRAM_EMBEDDER);
    }
    expect(await prepareRecallIndex()).toMatchObject({ dimension: TRIGRAM_EMBEDDER.dimension });
  });
});
