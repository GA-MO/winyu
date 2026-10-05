import { describe, expect, test } from "bun:test";
import type { QuickAction } from "@/lib/contracts";
import { answeredMetrics, chipRow, latestFollowUps } from "./follow-ups";
import { exchangesOf, type ChatMessage } from "./timeline";

function chip(id: string, prompt = id): QuickAction {
  return { id, label: id, prompt, score: 1, reason: "", intentKey: `follow|${id}` };
}

function queried(id: string, metric: string, followUps: unknown[]): ChatMessage[] {
  return [
    { id: `a-${id}`, role: "assistant", toolCalls: [{ id, function: { name: "query_metric", arguments: JSON.stringify({ metric }) } }] },
    { id: `t-${id}`, role: "tool", toolCallId: id, content: JSON.stringify({ ok: true, followUps }) },
  ];
}

const QUESTION: ChatMessage = { id: "u1", role: "user", content: "ถาม" };

describe("latestFollowUps", () => {
  test("takes the newest card of the latest answer", () => {
    const exchanges = exchangesOf([QUESTION, ...queried("c1", "net_sales_value", [chip("old")]), ...queried("c2", "net_sales_value", [chip("new")])]);
    expect(latestFollowUps(exchanges).map((action) => action.id)).toEqual(["new"]);
  });

  test("a new question clears the follow-ups of the previous answer, and malformed follow-ups are ignored", () => {
    expect(latestFollowUps(exchangesOf([QUESTION, ...queried("c1", "x", [chip("old")]), { id: "u2", role: "user", content: "ต่อ" }]))).toEqual([]);
    expect(latestFollowUps(exchangesOf([QUESTION, ...queried("c1", "x", [{ id: 1 }])]))).toEqual([]);
  });
});

describe("chipRow", () => {
  test("follow-ups first, learned chips fill the rest without repeating a prompt", () => {
    expect(chipRow([chip("why", "same")], [chip("learned", "same"), chip("other")], 3).map((action) => action.id)).toEqual(["why", "other"]);
  });

  test("a learned chip on the metric the latest answer read is left out", () => {
    const answered = answeredMetrics(exchangesOf([QUESTION, ...queried("c1", "attrition_rate", [])]));
    const learned = [{ ...chip("attrition"), intentKey: "attrition_rate|month" }, { ...chip("headcount"), intentKey: "headcount|department" }];
    expect(chipRow([], learned, 3, answered).map((action) => action.id)).toEqual(["headcount"]);
  });
});
