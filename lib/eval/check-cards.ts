import type { Spec, SpecElement } from "vexa/protocol";
import { watchMetricInputSchema } from "@/lib/contracts";
import type { EvalCase } from "./cases";

export type CheckId = "calledTool" | "askedApproval" | "usedCard" | "boundToTool" | "sortedRight" | "titleIsAnswer" | "noSummaryProse" | "grounded";

export type CheckResult = { id: CheckId; ok: boolean; detail: string };

export type ToolInput = { tool: string; input: unknown };

export type Turn = { text: string; spec: Spec | null; toolOutputs: Record<string, unknown>[]; toolInputs: ToolInput[] };

const APPROVAL_SCHEMAS: Partial<Record<string, { safeParse: (value: unknown) => { success: boolean } }>> = { watch_metric: watchMetricInputSchema };

const CARD_TYPES = new Set(["DataCard", "AlertsCard"]);
const NUMBER_IN_TEXT = /-?\d[\d,.]{2,}/g;
const MIN_TITLE_CHARS = 6;
const ISO_YEAR = /\b(\d{4})-\d{2}-\d{2}/g;
const BUDDHIST_ERA_OFFSET = 543;

function elements(spec: Spec | null): SpecElement[] {
  if (!spec || typeof spec.elements !== "object" || spec.elements === null) return [];
  return Object.values(spec.elements as Record<string, SpecElement>);
}

function cardElement(spec: Spec | null): SpecElement | null {
  return elements(spec).find((element) => CARD_TYPES.has(element.type)) ?? null;
}

function propsOf(element: SpecElement | null): Record<string, unknown> {
  return (element?.props ?? {}) as Record<string, unknown>;
}

function numbersIn(value: unknown, found: Set<string>) {
  if (typeof value === "number") found.add(String(value));
  if (typeof value === "string") for (const match of value.match(NUMBER_IN_TEXT) ?? []) found.add(match.replace(/,/g, ""));
  if (Array.isArray(value)) for (const item of value) numbersIn(item, found);
  if (typeof value === "object" && value !== null) for (const item of Object.values(value)) numbersIn(item, found);
}

function yearsIn(value: unknown, found: Set<string>) {
  const text = JSON.stringify(value) ?? "";
  for (const match of text.matchAll(ISO_YEAR)) {
    const year = Number(match[1]);
    found.add(String(year));
    found.add(String(year + BUDDHIST_ERA_OFFSET));
  }
}

function summariesOf(outputs: Record<string, unknown>[]): string[] {
  return outputs.map((output) => String(output.summary ?? "")).filter(Boolean);
}

function check(id: CheckId, ok: boolean, detail: string): CheckResult {
  return { id, ok, detail };
}

function groundedCheck(spec: Spec | null, outputs: Record<string, unknown>[]): CheckResult {
  const card = cardElement(spec);
  if (card) return check("grounded", true, "การ์ดผูกกับผลลัพธ์ tool ตัวเลขทั้งหมดมาจากที่นั่น");
  const inProps = new Set<string>();
  for (const element of elements(spec)) numbersIn(propsOf(element), inProps);
  const inTools = new Set<string>();
  numbersIn(outputs, inTools);
  yearsIn(outputs, inTools);
  const invented = [...inProps].filter((value) => !inTools.has(value));
  return check("grounded", invented.length === 0, invented.length === 0 ? "ทุกตัวเลขอยู่ในผลลัพธ์ tool" : `ตัวเลขที่ไม่มีใน tool: ${invented.slice(0, 5).join(", ")}`);
}

/** What a good Cop answer must be true of, checked without a model in the loop. */
export function checkTurn(turn: Turn, testCase: EvalCase): CheckResult[] {
  const card = cardElement(turn.spec);
  const props = propsOf(card);
  const source = props.source as { $state?: string } | undefined;
  const title = typeof props.title === "string" ? props.title : "";
  const description = props.description;
  const called = Math.max(turn.toolOutputs.length, turn.toolInputs.length);
  const results: CheckResult[] = [check("calledTool", called > 0, `เรียก tool ${called} ครั้ง`)];
  if (testCase.expectApproval) {
    const asked = turn.toolInputs.find((entry) => entry.tool === testCase.expectApproval);
    const schema = APPROVAL_SCHEMAS[testCase.expectApproval];
    const valid = asked !== undefined && (!schema || schema.safeParse(asked.input).success);
    results.push(check("askedApproval", valid, asked ? `input ${valid ? "ถูกต้อง" : "ไม่ผ่าน schema"}` : `ไม่ได้เรียก ${testCase.expectApproval}`));
  }
  if (testCase.expectComponent) {
    results.push(check("usedCard", card?.type === testCase.expectComponent, `ได้ ${card?.type ?? "ไม่มีการ์ด"} คาดว่า ${testCase.expectComponent}`));
    results.push(check("boundToTool", typeof source?.$state === "string" && source.$state.startsWith("/tools/"), `source = ${source?.$state ?? "ไม่ได้ผูก"}`));
    results.push(check("titleIsAnswer", title.length >= MIN_TITLE_CHARS, `title = "${title}"`));
    results.push(
      check("noSummaryProse", typeof description !== "string" || !summariesOf(turn.toolOutputs).some((summary) => description.includes(summary.slice(0, 20))), `description = ${String(description)}`),
    );
  }
  if (testCase.expectSort) {
    results.push(check("sortedRight", props.sortBy === testCase.expectSort, `sortBy = ${String(props.sortBy)} คาดว่า ${testCase.expectSort}`));
  }
  results.push(groundedCheck(turn.spec, turn.toolOutputs));
  return results;
}

export function scoreOf(results: CheckResult[]): { passed: number; total: number } {
  return { passed: results.filter((result) => result.ok).length, total: results.length };
}
