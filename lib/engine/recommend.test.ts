import { afterEach, describe, expect, test } from "bun:test";
import type { AccessContext, ActionEvent } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { memoryFacts } from "@/lib/server/agent/collections";
import { defaultActionsFor } from "@/lib/server/quick-actions";
import { TH } from "@/lib/i18n/th";
import { quickActionsFrom, scoreIntents } from "./recommend";
import { extractByRule, pruneMemory, rememberTurn } from "./memory";
import { intentKeyOf, turnsOf } from "@/lib/server/threads";

const USER = "u_anucha";
const NOW = Date.parse("2026-09-22T09:00:00.000Z");
const DAY_MS = 86_400_000;

function access(userId = USER): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

function event(id: string, intentKey: string, daysAgo: number, kind: ActionEvent["kind"] = "question", prompt = `ถาม ${intentKey}`): ActionEvent {
  return {
    id: `test_${id}`,
    userId: USER,
    at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    kind,
    intentKey,
    metric: intentKey.split("|")[0] as ActionEvent["metric"],
    dims: [],
    prompt,
    threadId: null,
  };
}

let seeded: ActionEvent[] = [];

function seed(events: ActionEvent[]): void {
  seeded = [...seeded, ...events];
}

afterEach(() => {
  seeded = [];
  for (const fact of memoryFacts().where((item) => item.userId === USER && item.sourceThreadId === null)) memoryFacts().remove(fact.id);
});

describe("recommender", () => {
  test("what the user asks most and most recently ranks first", () => {
    seed([
      event("a1", "net_sales_volume|agent", 1),
      event("a2", "net_sales_volume|agent", 2),
      event("a3", "net_sales_volume|agent", 3),
      event("b1", "gross_margin|month", 20),
    ]);
    const scored = scoreIntents(access(), NOW, seeded);
    expect(scored[0].intentKey).toBe("net_sales_volume|agent");
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
    expect(scored[0].reason).toBe(TH.quick.askedOften(3, 30));
  });

  test("an intent the user dismissed loses points and never becomes a chip", () => {
    seed([event("c1", "ar_overdue|region", 1), event("c2", "ar_overdue|region", 2)]);
    const before = scoreIntents(access(), NOW, seeded).find((scored) => scored.intentKey === "ar_overdue|region");
    seed([event("c3", "ar_overdue|region", 2, "dismiss")]);
    const after = scoreIntents(access(), NOW, seeded).find((scored) => scored.intentKey === "ar_overdue|region");
    expect(after?.score).toBeLessThan(before?.score as number);
    expect(quickActionsFrom(access(), defaultActionsFor(access()), NOW, seeded).some((action) => action.intentKey === "ar_overdue|region")).toBe(false);
  });

  test("recency decays, so an old intent loses to a fresh one with the same count", () => {
    seed([event("d1", "sell_out_volume|sku", 1), event("d2", "sell_out_volume|sku", 1.1), event("e1", "stock_on_hand|dc", 25), event("e2", "stock_on_hand|dc", 26)]);
    const scored = scoreIntents(access(), NOW, seeded);
    const fresh = scored.find((item) => item.intentKey === "sell_out_volume|sku");
    const stale = scored.find((item) => item.intentKey === "stock_on_hand|dc");
    expect(fresh?.score).toBeGreaterThan(stale?.score as number);
  });

  test("events older than the window are ignored", () => {
    seed([event("f1", "headcount|month", 45)]);
    expect(scoreIntents(access(), NOW, seeded).find((scored) => scored.intentKey === "headcount|month")).toBeUndefined();
  });

  test("a cold start falls back to the role defaults and still offers six chips", () => {
    const actions = quickActionsFrom(access(), defaultActionsFor(access()), NOW, seeded);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThanOrEqual(6);
    expect(new Set(actions.map((action) => action.id)).size).toBe(actions.length);
  });

  test("learned chips come before the defaults", () => {
    seed([event("g1", "days_of_cover|dc", 1), event("g2", "days_of_cover|dc", 1.5), event("g3", "days_of_cover|dc", 2)]);
    const actions = quickActionsFrom(access(), defaultActionsFor(access()), NOW, seeded);
    expect(actions[0].intentKey).toBe("days_of_cover|dc");
  });

  test("the end of Buddhist Lent earns a seasonal chip in September", () => {
    const actions = quickActionsFrom(access(), defaultActionsFor(access()), NOW, seeded);
    expect(actions.some((action) => action.id === "qa_season_lent")).toBe(true);
  });
});

describe("memory", () => {
  test("a metric synonym becomes an interest and a vocabulary fact", () => {
    const facts = extractByRule(["ยอดขายเข้าของเอเย่นต์เดือนนี้เป็นยังไง"]);
    expect(facts.some((fact) => fact.type === "interest")).toBe(true);
    expect(facts.length).toBeLessThanOrEqual(4);
  });

  test("the same fact twice is one row with higher confidence", async () => {
    const first = await rememberTurn(USER, [{ prompt: "ขอดูวันครอบคลุมสต๊อกของดีซีลำพูน" }], null);
    const second = await rememberTurn(USER, [{ prompt: "ขอดูวันครอบคลุมสต๊อกของดีซีลำพูน" }], null);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].confidence).toBeGreaterThan(first[0].confidence);
    const values = new Set(first.map((fact) => fact.value));
    expect(memoryFacts().where((fact) => fact.userId === USER && values.has(fact.value))).toHaveLength(first.length);
  });

  test("a fact past its decay date is dropped", async () => {
    const [fact] = await rememberTurn(USER, [{ prompt: "กำไรขั้นต้นเดือนนี้" }], null);
    memoryFacts().put({ ...fact, decayAt: "2020-01-01T00:00:00.000Z" });
    expect(pruneMemory(USER)).toBeGreaterThan(0);
    expect(memoryFacts().get(fact.id)).toBeNull();
  });
});

describe("threads", () => {
  test("a saved conversation becomes one turn with the metric the answer used", () => {
    const messages = [
      { id: "m1", role: "user", parts: [{ type: "text", text: "ยอดอีสานเทียบเป้า" }] },
      {
        id: "m2",
        role: "assistant",
        parts: [
          { type: "tool-query_metric", input: { metric: "target_attainment", dims: ["region"] } },
          { type: "text", text: "ยอดอีสานอยู่ที่ 92%" },
        ],
      },
    ];
    const [turn] = turnsOf(messages);
    expect(turn.prompt).toBe("ยอดอีสานเทียบเป้า");
    expect(turn.intentKey).toBe("target_attainment|region");
    expect(turn.answer).toContain("92%");
  });

  test("a turn without a query has no intent key", () => {
    const [turn] = turnsOf([{ id: "m1", role: "user", parts: [{ type: "text", text: "สวัสดี" }] }]);
    expect(turn.intentKey).toBe("");
    expect(intentKeyOf(null, [])).toBe("");
  });

  test("dims are sorted so the same slice always gets the same key", () => {
    expect(intentKeyOf("net_sales_volume", ["region", "brand"])).toBe(intentKeyOf("net_sales_volume", ["brand", "region"]));
  });
});
