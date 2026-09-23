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

describe("compared check", () => {
  const COMPARE_CASE: EvalCase = { id: "ar", userId: "u_siriporn", prompt: "ลูกหนี้ภาคใต้เทียบปีก่อน", expectCompare: { compare: "prev_year", range: { from: "2026-08-01", to: "2026-08-31" } } };

  function compared(inputs: unknown[]) {
    const toolInputs = inputs.map((input) => ({ tool: "query_metric", input }));
    return checkTurn({ text: "", spec: null, toolOutputs: [], toolInputs }, COMPARE_CASE).find((result) => result.id === "comparedRight");
  }

  test("passes when one query uses the expected compare and range", () => {
    const august = { compare: "prev_year", range: { from: "2026-08-01", to: "2026-08-31" } };
    expect(compared([{ compare: "none", range: august.range }, august])?.ok).toBe(true);
  });

  test("reads a range past the data as ending at the last data day", () => {
    const monthToDate: EvalCase = { ...COMPARE_CASE, expectCompare: { compare: "prev_period", range: { from: "2026-09-01", to: "2026-09-22" } } };
    const toolInputs = [{ tool: "query_metric", input: { compare: "prev_period", range: { from: "2026-09-01", to: "2026-09-23" } } }];
    expect(checkTurn({ text: "", spec: null, toolOutputs: [], toolInputs }, monthToDate).find((result) => result.id === "comparedRight")?.ok).toBe(true);
  });

  test("fails on the right compare over the wrong window", () => {
    const result = compared([{ compare: "prev_year", range: { from: "2026-09-01", to: "2026-09-22" } }]);
    expect(result?.ok).toBe(false);
    expect(result?.detail).toContain("prev_year 2026-09-01..2026-09-22");
  });
});
