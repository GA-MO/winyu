import { describe, expect, test } from "bun:test";
import { readFixture, readRecordings, turnOf } from "./recording";

const recordings = readRecordings();

function cardsOf(caseId: string) {
  const recording = recordings.get(caseId);
  if (!recording) throw new Error(`no recording for ${caseId}`);
  return turnOf(recording).cards;
}

describe("one card per question, from the recorded replies", () => {
  test("the metric catalog the model browsed before answering is not drawn beside the answer", () => {
    for (const caseId of ["finance-budget", "marketing-campaign", "hr-attrition", "ceo-attainment", "shape-province"]) {
      const tools = cardsOf(caseId).map((card) => card.tool);
      expect(tools).toContain("query_metric");
      expect(tools).not.toContain("list_metrics");
    }
  });

  test("a refused call the model corrected in the same reply draws no card, only the answer that followed", () => {
    const cards = turnOf(readFixture("finance-budget")).cards.filter((card) => card.tool === "query_metric");
    expect(cards).toHaveLength(1);
    expect((cards[0].result as { ok: unknown }).ok).toBe(true);
  });

  test("the catalog stays when it is the answer", () => {
    expect(cardsOf("freshness").map((card) => card.tool)).toEqual(["list_metrics"]);
  });
});
