import { afterEach, describe, expect, test } from "bun:test";
import type { MemoryFact } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { actionEvents, memoryFacts } from "@/lib/server/agent/collections";
import { personaFor } from "@/lib/server/agent/persona";
import { threads } from "@/lib/server/threads-read";
import { confirmMemory, consolidateMemory, editMemory, forgetAll, pruneMemory, rememberAction, rememberTurn } from "./memory";
import { isSameFact } from "./memory-match";
import { memoryStatus, seenCount } from "./memory-status";

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
  for (const fact of mine()) memoryFacts().remove(fact.id);
  for (const event of actionEvents().where((item) => item.userId === USER)) actionEvents().remove(event.id);
  for (const thread of threads().where((item) => item.userId === USER)) threads().remove(thread.id);
});

describe("isSameFact", () => {
  test("paraphrases of one interest are the same fact", () => {
    expect(isSameFact({ type: "interest", value: "สนใจการตรวจสอบสินค้าที่มีความเสี่ยงจะขาดสต็อก" }, { type: "interest", value: "สนใจการติดตามสินค้าที่เสี่ยงต่อการขาดสต็อก" })).toBe(true);
    expect(isSameFact({ type: "vocabulary", value: "ใช้คำว่า เอเย่นต์ ในการเรียกตัวแทนจำหน่าย" }, { type: "vocabulary", value: "ใช้คำว่า 'เอเย่นต์' สำหรับเรียกตัวแทนจำหน่ายหรือคู่ค้า" })).toBe(true);
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
