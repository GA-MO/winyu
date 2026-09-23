import { describe, expect, test } from "bun:test";
import type { Spec } from "vexa/protocol";
import type { EvalCase } from "./cases";
import { checkTurn } from "./check-cards";

const CASE: EvalCase = { id: "forecast", userId: "u_wee", prompt: "พยากรณ์ยอดขายอีก 8 สัปดาห์" };

function handDrawn(footnote: string, value: string): Spec {
  return {
    root: "main",
    elements: {
      main: { type: "Card", props: { title: "พยากรณ์ 8 สัปดาห์", footnote }, children: ["headline"] },
      headline: { type: "Metric", props: { label: "รวม", value }, children: [] },
    },
  } as unknown as Spec;
}

function grounded(spec: Spec) {
  const outputs = [{ ok: true, total: 494728, provenance: { asOf: "2026-09-22" } }];
  return checkTurn({ text: "", spec, toolOutputs: outputs, toolInputs: [] }, CASE).find((result) => result.id === "grounded");
}

describe("grounded check", () => {
  test("accepts a tool date rewritten in the Thai calendar", () => {
    expect(grounded(handDrawn("ณ 22 ก.ย. 2569", "494,728"))?.ok).toBe(true);
  });

  test("still flags a number that no tool returned", () => {
    expect(grounded(handDrawn("ณ 22 ก.ย. 2569", "61,841"))?.detail).toContain("61841");
  });
});
