import { describe, expect, test } from "bun:test";
import { parseResult } from "@/components/cards/entity/shapes";
import { readFixture } from "@/lib/eval/recording";
import { TH } from "@/lib/i18n/th";
import { z } from "zod";
import { refusalOf } from "./tool-answers";

function deniedOf(result: unknown) {
  const denied = refusalOf(result);
  if (!denied) throw new Error("expected a refusal");
  return denied;
}

function recordedRefusal(): { error: string; fix: string } {
  const step = readFixture("finance-budget")
    .steps.find((candidate) => candidate.kind === "call" && candidate.tool === "query_metric" && (candidate.result as { ok?: unknown }).ok === false);
  if (!step || step.kind !== "call") throw new Error("finance-budget has no refused query_metric");
  return step.result as { error: string; fix: string };
}

describe("a refusal card tells the person the truth", () => {
  test("a query the model got wrong is not called out of scope and shows none of the text written for the model", () => {
    const refusal = recordedRefusal();
    const denied = deniedOf(refusal);
    expect(denied.title).not.toBe(TH.dash.denied);
    expect(denied).toEqual({ title: TH.cards.failed.title, body: TH.cards.failed.other });
    expect(JSON.stringify(denied)).not.toContain(refusal.error);
    expect(JSON.stringify(denied)).not.toContain("compare");
  });

  test("a scope denial is out of scope, in the server's own words", () => {
    const error = "คุณไม่มีสิทธิ์ดูข้อมูลของ ภาคเหนือ (นอกขอบเขตภาคที่รับผิดชอบ)";
    expect(deniedOf({ ok: false, code: "PERMISSION_DENIED", error })).toEqual({ title: TH.dash.denied, body: error });
    expect(deniedOf({ ok: false, code: "TOOL_NOT_ALLOWED", error }).title).toBe(TH.dash.denied);
  });

  test("an admin rule keeps its reason, written for people", () => {
    const error = TH.harness.policyRule("ห้ามดูงบรายภาค");
    expect(deniedOf({ ok: false, code: "POLICY_RULE", error })).toEqual({ title: TH.cards.refused, body: error });
  });

  test("every other code gets a neutral line, never the model-facing reason", () => {
    const lines: [string, string][] = [
      ["TIMEOUT", TH.cards.failed.timeout],
      ["UNAVAILABLE", TH.cards.failed.unavailable],
      ["RUN_LIMIT", TH.cards.failed.runLimit],
      ["VERIFICATION_FAILED", TH.cards.failed.withheld],
      ["BAD_QUERY", TH.cards.failed.other],
      ["UNKNOWN_METRIC", TH.cards.failed.other],
      ["ERROR", TH.cards.failed.other],
    ];
    for (const [code, body] of lines) {
      const error = `model-facing reason for ${code}`;
      expect(deniedOf({ ok: false, code, error, fix: "call again" })).toEqual({ title: TH.cards.failed.title, body });
    }
  });

  test("an entity card shows a domain refusal without a code in the server's words, and a coded one neutrally", () => {
    const shape = z.object({ id: z.string() });
    expect(parseResult(shape, { ok: false, error: "ไม่พบพนักงาน สมชาย" })).toEqual({ kind: "refused", notice: { title: TH.cards.refused, body: "ไม่พบพนักงาน สมชาย" } });
    expect(parseResult(shape, { ok: false, code: "BAD_QUERY", error: "use compare none" })).toEqual({ kind: "refused", notice: { title: TH.cards.failed.title, body: TH.cards.failed.other } });
  });
});
