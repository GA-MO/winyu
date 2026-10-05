import { describe, expect, test } from "bun:test";
import { SpanType, type AnySpan } from "@mastra/core/observability";
import { TH } from "@/lib/i18n/th";
import { personalFieldsHidden } from "./observability";

function toolSpan(entityName: string, input: unknown): AnySpan {
  return { type: SpanType.TOOL_CALL, entityName, input } as unknown as AnySpan;
}

describe("personalFieldsHidden", () => {
  test("hides a tool's redact fields in its span input and keeps the rest", () => {
    const span = personalFieldsHidden.process(toolSpan("request_leave", { reason: "ไปหาหมอ", from: "2026-10-06", to: "2026-10-07" }));
    expect(span?.input).toEqual({ reason: TH.admin.auditTab.redacted, from: "2026-10-06", to: "2026-10-07" });
  });

  test("leaves a tool without personal fields untouched", () => {
    const input = { metric: "net_sales_value", filters: { region: "north" } };
    expect(personalFieldsHidden.process(toolSpan("query_metric", input))?.input).toEqual(input);
  });
});
