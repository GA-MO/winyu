import { describe, expect, test } from "bun:test";
import type { QuickAction } from "@/lib/contracts";
import { chipRow, latestFollowUps } from "./follow-ups";

function chip(id: string, prompt = id): QuickAction {
  return { id, label: id, prompt, score: 1, reason: "", intentKey: `follow|${id}` };
}

function queryPart(followUps: QuickAction[]) {
  return { type: "tool-query_metric", output: { ok: true, followUps } };
}

describe("latestFollowUps", () => {
  test("takes the newest card of the latest answer", () => {
    const messages = [
      { role: "user", parts: [{ type: "text" }] },
      { role: "assistant", parts: [queryPart([chip("old")]), queryPart([chip("new")]), { type: "text" }] },
    ];
    expect(latestFollowUps(messages).map((action) => action.id)).toEqual(["new"]);
  });

  test("a new question clears the follow-ups of the previous answer", () => {
    const messages = [
      { role: "assistant", parts: [queryPart([chip("old")])] },
      { role: "user", parts: [{ type: "text" }] },
    ];
    expect(latestFollowUps(messages)).toEqual([]);
  });

  test("ignores malformed output", () => {
    expect(latestFollowUps([{ role: "assistant", parts: [{ type: "tool-query_metric", output: { followUps: [{ id: 1 }] } }] }])).toEqual([]);
  });
});

describe("chipRow", () => {
  test("follow-ups first, learned chips fill the rest without repeating a prompt", () => {
    const row = chipRow([chip("why", "same")], [chip("learned", "same"), chip("other")], 3);
    expect(row.map((action) => action.id)).toEqual(["why", "other"]);
  });
});
