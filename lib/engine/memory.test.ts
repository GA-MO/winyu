import { afterEach, describe, expect, test } from "bun:test";
import type { MemoryFact } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { actionEvents, memoryFacts } from "@/lib/server/agent/collections";
import { personaFor, relevantMemory } from "@/lib/server/agent/persona";
import { threads } from "@/lib/server/threads-read";
import { confirmMemory, consolidateMemory, editMemory, forgetAbout, forgetAll, learnExtracted, namesOutsideScope, pruneMemory, rejectMemory, rememberAction, rememberStated, rememberTurn } from "./memory";
import { isSameFact } from "./memory-match";
import { isTrusted, memoryStatus, seenCount } from "./memory-status";

const USER = "u_memory_test";
const HOST = "u_anucha";
const DAY_MS = 86_400_000;
const DISTINCT_TOPICS = ["ฝนตกภาคใต้", "ราคาข้าวมอลต์", "ทีมฟุตบอล", "ขวดแก้วรีไซเคิล", "งานวัดประจำปี", "ร้านอาหารริมทาง", "คอนเสิร์ตกลางแจ้ง", "ค่าขนส่งทางเรือ", "โรงงานสิงห์บุรี", "ป้ายโฆษณาบนทางด่วน", "น้ำแข็งหลอด", "ท่าเรือแหลมฉบัง"];

function mine(): MemoryFact[] {
  return memoryFacts().where((fact) => fact.userId === USER);
}

function plant(value: string, overrides: Partial<MemoryFact> = {}): MemoryFact {
  return memoryFacts().put({
    id: `mem_test_${Math.random().toString(36).slice(2, 10)}`,
    userId: USER,
    type: "interest",
    value,
    confidence: 0.45,
    sourceThreadId: "thread_a",
    createdAt: new Date().toISOString(),
    decayAt: new Date(Date.now() + 14 * DAY_MS).toISOString(),
    ...overrides,
  });
}

function personaMemory(): string {
  const host = findUser(HOST);
  if (!host) throw new Error(`missing demo user ${HOST}`);
  return personaFor({ ...accessFor(host), userId: USER }, host, { today: "2026-09-23", context: {} }).join("\n");
}

afterEach(() => {
  forgetAll(USER);
  for (const fact of mine()) memoryFacts().remove(fact.id);
  for (const event of actionEvents().where((item) => item.userId === USER)) actionEvents().remove(event.id);
  for (const thread of threads().where((item) => item.userId === USER)) threads().remove(thread.id);
});

describe("isSameFact", () => {
  test("paraphrases of one interest are the same fact", () => {
    expect(isSameFact({ type: "interest", value: "สนใจการตรวจสอบสินค้าที่มีความเสี่ยงจะขาดสต็อก" }, { type: "interest", value: "สนใจการติดตามสินค้าที่เสี่ยงต่อการขาดสต็อก" })).toBe(true);
    expect(isSameFact({ type: "vocabulary", value: "ใช้คำว่า เอเย่นต์ ในการเรียกตัวแทนจำหน่าย" }, { type: "vocabulary", value: "ใช้คำว่า 'เอเย่นต์' สำหรับเรียกตัวแทนจำหน่ายหรือคู่ค้า" })).toBe(true);
  });

  test("interests in different slices of one metric stay apart, while a rephrasing of the same slice is the same fact", () => {
    const byAgent = { type: "interest" as const, value: "สนใจปริมาณขายเข้ารายเอเย่นต์" };
    for (const other of ["สนใจปริมาณขายเข้าของลีโอในภาคใต้", "สนใจปริมาณขายเข้าภาคใต้", "สนใจปริมาณขายเข้าเทียบเป้า", "สนใจปริมาณขายเข้าแยกตามแบรนด์"]) {
      expect(isSameFact(byAgent, { type: "interest", value: other })).toBe(false);
    }
    expect(isSameFact(byAgent, { type: "interest", value: "ติดตามยอดขายเข้าแยกตามเอเย่นต์" })).toBe(true);
    expect(isSameFact({ type: "interest", value: "สนใจปริมาณขายเข้าของลีโอในภาคใต้" }, { type: "interest", value: "ติดตามปริมาณขายเข้าลีโอภาคใต้ทุกสัปดาห์" })).toBe(true);
  });

  test("hearing Leo in the South neither strengthens the by-agent interest nor is folded into it, even when the extractor names it as the same", () => {
    const byAgent = plant("สนใจปริมาณขายเข้ารายเอเย่นต์", { confidence: 0.75, seen: 3 });
    learnExtracted(USER, [{ type: "interest", value: "สนใจปริมาณขายเข้าของลีโอในภาคใต้", sameAs: byAgent.id }], "thread_b");
    expect(memoryFacts().get(byAgent.id)?.seen).toBe(3);
    expect(mine().map((fact) => fact.value).sort()).toEqual(["สนใจปริมาณขายเข้ารายเอเย่นต์", "สนใจปริมาณขายเข้าของลีโอในภาคใต้"].sort());
  });

  test("facts about different metrics or different words stay apart", () => {
    expect(isSameFact({ type: "interest", value: "สนใจปริมาณขายเข้า (Sell-in)เป็นประจำ" }, { type: "interest", value: "สนใจปริมาณขายออก (Sell-out)เป็นประจำ" })).toBe(false);
    expect(isSameFact({ type: "vocabulary", value: 'เรียกปริมาณขายเข้า (Sell-in)ว่า "volume"' }, { type: "vocabulary", value: 'เรียกปริมาณขายเข้า (Sell-in)ว่า "ขายเข้า"' })).toBe(false);
    expect(isSameFact({ type: "interest", value: "สนใจเงินเดือนเฉลี่ย" }, { type: "preference", value: "สนใจเงินเดือนเฉลี่ย" })).toBe(false);
  });
});

describe("learning before trusting", () => {
  test("a fact heard once is learning and stays out of the prompt; heard again it is known", async () => {
    const [first] = await rememberTurn(USER, [{ prompt: "กำไรขั้นต้นเดือนนี้" }], "thread_a");
    expect(first && memoryStatus(first)).toBe("learning");
    expect(personaMemory()).not.toContain(first?.value ?? "-");
    const [second] = await rememberTurn(USER, [{ prompt: "ขอดูกำไรขั้นต้นอีกที" }], "thread_b");
    expect(second?.id).toBe(first?.id);
    expect(second && memoryStatus(second)).toBe("known");
    expect(second && seenCount(second)).toBe(2);
    expect(personaMemory()).toContain(second?.value ?? "-");
  });

  test("repeats inside one conversation are not new evidence: the fact stays learning until another conversation brings it up", () => {
    const [first] = learnExtracted(USER, [{ type: "interest", value: "สนใจปริมาณขายเข้าแยกตามแบรนด์" }], "thread_a");
    learnExtracted(USER, [{ type: "interest", value: "สนใจปริมาณขายเข้าแยกตามแบรนด์" }], "thread_a");
    const [third] = learnExtracted(USER, [{ type: "interest", value: "สนใจปริมาณขายเข้าแยกตามแบรนด์" }], "thread_a");
    expect(third?.id).toBe(first?.id);
    expect(third && memoryStatus(third)).toBe("learning");
    expect(relevantMemory(USER, "ปริมาณขายเข้าแยกตามแบรนด์").map((fact) => fact.value)).not.toContain("สนใจปริมาณขายเข้าแยกตามแบรนด์");
    const [elsewhere] = learnExtracted(USER, [{ type: "interest", value: "สนใจปริมาณขายเข้าแยกตามแบรนด์" }], "thread_b");
    expect(elsewhere && memoryStatus(elsewhere)).toBe("known");
  });

  test("a word used once in a question is not the person's vocabulary unless they define it", async () => {
    await rememberTurn(USER, [{ prompt: "ขอดู sell-in ลีโอเดือนนี้" }], "thread_a");
    expect(mine().filter((fact) => fact.type === "vocabulary")).toEqual([]);
    await rememberTurn(USER, [{ prompt: "ผมเรียกขายเข้าว่า sellin นะ ขอดู sellin เดือนนี้" }], "thread_b");
    expect(mine().filter((fact) => fact.type === "vocabulary")).toHaveLength(1);
  });

  test("a figure the person says is never stored, even when they ask for it to be remembered", () => {
    expect(learnExtracted(USER, [{ type: "preference", value: "เป้าทั้งปีของลีโอคือ 900 ล้านลิตร", asked: true }], "thread_a")).toEqual([]);
    expect(rememberStated(USER, { type: "interest", value: "เป้าลีโอ 900 ล้านลิตร", until: null }, "thread_a")).toBeNull();
    expect(mine()).toEqual([]);
  });

  test("a dated responsibility keeps its last day, reaches the prompt with it, and is gone once the day is over", () => {
    const [fact] = learnExtracted(USER, [{ type: "responsibility", value: "นำเสนอผลไตรมาสสามต่อคณะกรรมการ", asked: true, until: "2099-01-01" }], "thread_a");
    expect(fact?.until).toBe("2099-01-01");
    expect(personaMemory()).toContain("นำเสนอผลไตรมาสสามต่อคณะกรรมการ (ถึง 2099-01-01)");
    memoryFacts().put({ ...(fact as MemoryFact), until: "2020-01-01" });
    expect(relevantMemory(USER, "คณะกรรมการ")).toEqual([]);
    expect(pruneMemory(USER)).toBe(1);
    expect(mine()).toEqual([]);
  });

  test("something the user did is known at once", () => {
    const [fact] = rememberAction(USER, { type: "preference", value: "ให้เตือนเมื่อกำไรขั้นต้น ต่ำกว่า 20%" });
    expect(fact && memoryStatus(fact)).toBe("known");
  });

  test("a confirmed fact never decays and survives a prune", () => {
    const fact = plant("สนใจสต๊อกคงเหลือ");
    confirmMemory(USER, fact.id);
    expect(memoryStatus(memoryFacts().get(fact.id) as MemoryFact)).toBe("confirmed");
    expect(pruneMemory(USER)).toBe(0);
    expect(confirmMemory("u_pim", fact.id)).toBeNull();
  });
});

describe("asked to remember", () => {
  const REGION_FACT = "ดูแลภาคอีสานเป็นหลัก";

  test("a fact the user asked to be remembered is trusted at once and reaches the next question", () => {
    const [fact] = learnExtracted(USER, [{ type: "responsibility", value: REGION_FACT, asked: true }], "thread_a");
    expect(fact && isTrusted(fact)).toBe(true);
    expect(relevantMemory(USER, "ยอดขายเดือนนี้เทียบเป้าเป็นยังไง").map((item) => item.value)).toContain(REGION_FACT);
  });

  test("the same fact only said in passing still waits to be heard again", () => {
    const [fact] = learnExtracted(USER, [{ type: "responsibility", value: REGION_FACT, asked: false }], "thread_a");
    expect(fact && isTrusted(fact)).toBe(false);
    expect(relevantMemory(USER, "ยอดขายเดือนนี้เทียบเป้าเป็นยังไง").map((item) => item.value)).not.toContain(REGION_FACT);
  });

  test("asking to remember a fact still being learned lifts it to trusted and never lowers it", () => {
    const learning = plant(REGION_FACT, { type: "responsibility", confidence: 0.3 });
    const [lifted] = learnExtracted(USER, [{ type: "responsibility", value: REGION_FACT, sameAs: learning.id, asked: true }], "thread_b");
    expect(lifted?.id).toBe(learning.id);
    expect(lifted && isTrusted(lifted)).toBe(true);
    const [again] = learnExtracted(USER, [{ type: "responsibility", value: REGION_FACT, sameAs: learning.id, asked: true }], "thread_c");
    expect(again?.confidence).toBeGreaterThanOrEqual(lifted?.confidence ?? 1);
  });
});

describe("the user's own hand", () => {
  test("a rewritten fact takes the new wording and counts as confirmed; empty or someone else's is refused", () => {
    const fact = plant("สนใจสต๊อก");
    const edited = editMemory(USER, fact.id, "  สนใจวันครอบคลุมสต๊อกของดีซีภาคเหนือ ");
    expect(edited?.value).toBe("สนใจวันครอบคลุมสต๊อกของดีซีภาคเหนือ");
    expect(edited && memoryStatus(edited)).toBe("confirmed");
    expect(editMemory(USER, fact.id, " a ")).toBeNull();
    expect(editMemory("u_pim", fact.id, "สนใจอย่างอื่น")).toBeNull();
  });

  test("forgetting everything leaves other users untouched", () => {
    plant("สนใจสต๊อก");
    plant("สนใจเงินเดือน");
    const others = memoryFacts().where((fact) => fact.userId !== USER).length;
    expect(forgetAll(USER)).toBe(2);
    expect(mine()).toHaveLength(0);
    expect(memoryFacts().where((fact) => fact.userId !== USER)).toHaveLength(others);
  });
});

describe("forgetting and rejecting", () => {
  const SOUTH = 'เรียกภาคใต้ว่า "ด้ามขวาน"';

  test("forgetting a word removes every fact about it, trusted or learning, and learning never brings it back from what the person says", () => {
    learnExtracted(USER, [{ type: "vocabulary", value: SOUTH, asked: true }], "thread_a");
    plant("สนใจยอดขายลีโอในด้ามขวาน");
    expect(forgetAbout(USER, "ด้ามขวาน").map((fact) => fact.value).sort()).toEqual([SOUTH, "สนใจยอดขายลีโอในด้ามขวาน"].sort());
    expect(mine()).toEqual([]);
    expect(learnExtracted(USER, [{ type: "vocabulary", value: SOUTH }], "thread_b")).toEqual([]);
    expect(learnExtracted(USER, [{ type: "interest", value: "สนใจปริมาณขายเข้าด้ามขวาน" }], "thread_b")).toEqual([]);
    expect(mine()).toEqual([]);
  });

  test("a rejected fact comes back only when the person asks for it again", () => {
    const fact = plant(SOUTH, { type: "vocabulary", confidence: 0.75 });
    expect(rejectMemory("u_pim", fact.id)).toBeNull();
    expect(rejectMemory(USER, fact.id)?.id).toBe(fact.id);
    expect(learnExtracted(USER, [{ type: "vocabulary", value: SOUTH }], "thread_b")).toEqual([]);
    const [asked] = learnExtracted(USER, [{ type: "vocabulary", value: SOUTH, asked: true }], "thread_c");
    expect(asked && isTrusted(asked)).toBe(true);
  });

  test("forgetting everything also drops the record of what was rejected", () => {
    forgetAbout(USER, "ด้ามขวาน");
    forgetAll(USER);
    const [again] = learnExtracted(USER, [{ type: "vocabulary", value: SOUTH }], "thread_b");
    expect(again?.value).toBe(SOUTH);
  });

  test("remembering in chat keeps the approved wording as confirmed and replaces the fact that says the same thing", () => {
    const learning = plant("ชอบคำตอบสั้น", { type: "style" });
    const kept = rememberStated(USER, { type: "style", value: "ชอบคำตอบสั้น ๆ", until: null }, "thread_b");
    expect(kept?.id).toBe(learning.id);
    expect(kept?.value).toBe("ชอบคำตอบสั้น ๆ");
    expect(kept && memoryStatus(kept)).toBe("confirmed");
  });
});

describe("consolidateMemory", () => {
  test("paraphrases fold into one fact and only other conversations count as evidence", () => {
    plant("สนใจการตรวจสอบสินค้าที่มีความเสี่ยงจะขาดสต็อก");
    plant("สนใจการติดตามสินค้าที่เสี่ยงต่อการขาดสต็อก");
    plant("สนใจการตรวจสอบและป้องกันสินค้าขาดสต็อก", { sourceThreadId: "thread_b" });
    plant("สนใจปริมาณขายออก (Sell-out)เป็นประจำ");
    const result = consolidateMemory(USER);
    expect(result).toEqual({ before: 4, after: 2 });
    const stock = mine().find((fact) => fact.value.includes("สต็อก"));
    expect(stock?.confidence).toBeCloseTo(0.6);
    expect(stock && seenCount(stock)).toBe(3);
  });

  test("the learning shelf keeps the facts seen most recently", () => {
    DISTINCT_TOPICS.forEach((topic, index) => plant(`สนใจ${topic}`, { decayAt: new Date(Date.now() + (index + 1) * DAY_MS).toISOString() }));
    consolidateMemory(USER);
    const kept = mine().map((fact) => fact.value);
    expect(kept).toHaveLength(10);
    expect(kept).not.toContain(`สนใจ${DISTINCT_TOPICS[0]}`);
    expect(kept).toContain(`สนใจ${DISTINCT_TOPICS[11]}`);
  });
});

describe("facts about data outside the person's scope", () => {
  const user = findUser("u_anucha");
  if (!user) throw new Error("no u_anucha");
  const rsm = accessFor(user);
  const ceo = { ...rsm, regions: "all" as const };

  test("an interest or responsibility naming a region the person cannot see is out of scope; their own region, a style or a word is not", () => {
    expect(namesOutsideScope({ type: "interest", value: "สนใจปริมาณขายเข้าภาคใต้" }, rsm)).toBe(true);
    expect(namesOutsideScope({ type: "interest", value: "สนใจเปรียบเทียบปริมาณขายเข้าภาคอีสานกับภาคเหนือ" }, rsm)).toBe(true);
    expect(namesOutsideScope({ type: "responsibility", value: "ดูแลยอดขายภาคกลาง" }, rsm)).toBe(true);
    expect(namesOutsideScope({ type: "interest", value: "สนใจปริมาณขายเข้าภาคอีสาน" }, rsm)).toBe(false);
    expect(namesOutsideScope({ type: "style", value: "ตอบสั้นเรื่องภาคใต้" }, rsm)).toBe(false);
    expect(namesOutsideScope({ type: "interest", value: "สนใจปริมาณขายเข้าภาคใต้" }, ceo)).toBe(false);
  });
});
