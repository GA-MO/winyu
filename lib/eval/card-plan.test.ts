import { describe, expect, test } from "bun:test";
import { readRecordings, turnOf } from "./recording";

const recordings = readRecordings();

function cardsOf(caseId: string) {
  const recording = recordings.get(caseId);
  if (!recording) throw new Error(`no recording for ${caseId}`);
  return turnOf(recording).cards;
}

function passagesOf(result: unknown): { section: string; text: string }[] {
  return (result as { data: { passages: { section: string; text: string }[] } }).data.passages;
}

describe("one card per question, from the recorded replies", () => {
  test("two document searches in one reply draw one documents card holding every passage once", () => {
    const recording = recordings.get("docs-hr-hidden");
    const searched = (recording?.steps ?? []).flatMap((step) => (step.kind === "call" && step.tool === "search_documents" ? passagesOf(step.result) : []));
    const distinct = new Set(searched.map((passage) => `${passage.section}|${passage.text}`));
    expect(searched.length).toBeGreaterThan(distinct.size);
    const cards = cardsOf("docs-hr-hidden");
    expect(cards.map((card) => card.tool)).toEqual(["search_documents"]);
    expect(passagesOf(cards[0].result)).toHaveLength(distinct.size);
  });

  test("the metric catalog the model browsed before answering is not drawn beside the answer", () => {
    for (const caseId of ["finance-budget", "marketing-campaign", "hr-attrition", "ceo-attainment", "shape-province"]) {
      const tools = cardsOf(caseId).map((card) => card.tool);
      expect(tools).toContain("query_metric");
      expect(tools).not.toContain("list_metrics");
    }
  });

  test("the catalog stays when it is the answer", () => {
    expect(cardsOf("freshness").map((card) => card.tool)).toEqual(["list_metrics"]);
  });
});
