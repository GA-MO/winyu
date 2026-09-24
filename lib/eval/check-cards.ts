import type { Spec, SpecElement } from "vexa/protocol";
import { TOOL_SURFACE, watchMetricInputSchema } from "@/lib/contracts";
import { TODAY } from "@/lib/data/dates";
import { presentCard, type CardView, type PresentSource, type SortBy } from "@/lib/cards/present";
import type { MetricQuery, MetricResult } from "@/lib/contracts";
import type { EvalCase } from "./cases";

export type CheckId = "calledTool" | "askedApproval" | "usedCard" | "boundToTool" | "sortedRight" | "comparedRight" | "cutRight" | "drewShape" | "titleIsAnswer" | "noSummaryProse" | "grounded"
  | "composedPeople" | "picturesGrounded" | "pressBound" | "pressAsks" | "noCarousel";

export type CheckResult = { id: CheckId; ok: boolean; detail: string };

export type ToolInput = { tool: string; input: unknown };

export type Turn = { text: string; spec: Spec | null; toolOutputs: Record<string, unknown>[]; toolInputs: ToolInput[] };

const APPROVAL_SCHEMAS: Partial<Record<string, { safeParse: (value: unknown) => { success: boolean } }>> = { watch_metric: watchMetricInputSchema };

const CARD_TYPES = new Set(["DataCard", "AlertsCard"]);
const NUMBER_IN_TEXT = /-?\d[\d,.]{2,}/g;
const MIN_TITLE_CHARS = 6;
const ISO_YEAR = /\b(\d{4})-\d{2}-\d{2}/g;
const BUDDHIST_ERA_OFFSET = 543;
const METRIC_TOOL = "query_metric";
const ENGINE_DEFAULT_SORT = "value_desc";
const METRIC_PATH = /^\/tools\/query_metric(?:\.(\d+))?$/;

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

function canonicalNumber(text: string): string {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? String(value) : text;
}

function numbersIn(value: unknown, found: Set<string>) {
  if (typeof value === "number") found.add(String(value));
  if (typeof value === "string") for (const match of value.match(NUMBER_IN_TEXT) ?? []) found.add(canonicalNumber(match));
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

function describeQuery(input: unknown): string {
  const query = input as { compare?: string; range?: { from?: string; to?: string } };
  return `${query.compare ?? "?"} ${query.range?.from ?? "?"}..${query.range?.to ?? "?"}`;
}

/** The last day the engine actually reads: a range that runs past the data is cut at TODAY. */
function readEnd(to: string | undefined): string | undefined {
  return to !== undefined && to > TODAY ? TODAY : to;
}

function comparedCheck(turn: Turn, expected: NonNullable<EvalCase["expectCompare"]>): CheckResult {
  const queries = turn.toolInputs.filter((entry) => entry.tool === METRIC_TOOL).map((entry) => entry.input);
  const matches = queries.some((input) => {
    const query = input as { compare?: string; range?: { from?: string; to?: string } };
    if (query.compare !== expected.compare) return false;
    return !expected.range || (query.range?.from === expected.range.from && readEnd(query.range?.to) === expected.range.to);
  });
  const wanted = expected.range ? `${expected.compare} ${expected.range.from}..${expected.range.to}` : expected.compare;
  return check("comparedRight", matches, `ได้ ${queries.map(describeQuery).join(" · ") || "ไม่ได้ query"} คาดว่า ${wanted}`);
}

function groundedCheck(spec: Spec | null, outputs: Record<string, unknown>[]): CheckResult {
  const card = cardElement(spec);
  if (card) return check("grounded", true, "การ์ดผูกกับผลลัพธ์ tool ตัวเลขทั้งหมดมาจากที่นั่น");
  const inProps = new Set<string>();
  for (const element of elements(spec)) numbersIn(propsOf(element), inProps);
  const inTools = new Set<string>();
  numbersIn(outputs, inTools);
  yearsIn(outputs, inTools);
  yearsIn(TODAY, inTools);
  const invented = [...inProps].filter((value) => !inTools.has(value));
  return check("grounded", invented.length === 0, invented.length === 0 ? "ทุกตัวเลขอยู่ในผลลัพธ์ tool" : `ตัวเลขที่ไม่มีใน tool: ${invented.slice(0, 5).join(", ")}`);
}

/** What a good Cop answer must be true of, checked without a model in the loop. */
function metricAnswers(turn: Turn): Record<string, unknown>[] {
  return turn.toolOutputs.filter((output) => "query" in output || (output.ok === false && "code" in output));
}

function boundAnswer(binding: unknown, answers: Record<string, unknown>[]): PresentSource | null {
  const path = (binding as { $state?: unknown } | null)?.$state;
  const match = typeof path === "string" ? METRIC_PATH.exec(path) : null;
  if (!match) return null;
  const output = match[1] ? answers[Number(match[1]) - 1] : answers[answers.length - 1];
  if (!output || !("query" in output)) return null;
  return { query: output.query as MetricQuery, result: output as unknown as MetricResult };
}

/** A limited query must be ranked the way the card is ordered, or the limit keeps the wrong rows (the ten biggest, not the ten that fell most). */
function cutCheck(turn: Turn, expected: NonNullable<EvalCase["expectSort"]>): CheckResult {
  const limited = turn.toolInputs.filter((entry) => entry.tool === METRIC_TOOL).map((entry) => entry.input as { limit?: unknown; sort?: unknown }).filter((input) => typeof input.limit === "number");
  if (limited.length === 0) return check("cutRight", true, "ไม่ได้ตัดด้วย limit");
  const wrong = limited.filter((input) => (input.sort ?? ENGINE_DEFAULT_SORT) !== expected);
  return check("cutRight", wrong.length === 0, wrong.length === 0 ? `sort = ${expected} ก่อนตัด` : `ตัดด้วย limit แต่ sort = ${String(wrong[0].sort ?? "ไม่ได้ส่ง")} คาดว่า ${expected}`);
}

function shapeCheck(turn: Turn, props: Record<string, unknown>, expected: NonNullable<EvalCase["expectShape"]>): CheckResult {
  const answers = metricAnswers(turn);
  const first = boundAnswer(props.source, answers);
  if (!first) return check("drewShape", false, "การ์ดไม่ได้ผูกกับผล query_metric");
  const others = (Array.isArray(props.with) ? props.with : []).map((binding) => boundAnswer(binding, answers)).filter((other): other is PresentSource => other !== null);
  const body = presentCard({ title: "", query: first.query, result: first.result, view: (props.view as CardView | null) ?? "auto", sortBy: (props.sortBy as SortBy | null) ?? null, others }).body;
  return check("drewShape", body.kind === expected, `วาดเป็น ${body.kind} คาดว่า ${expected} (dims ${first.query.dims.join(",") || "-"}, with ${others.length})`);
}

const COMPOSED_TYPES: ReadonlySet<string> = new Set(["ListItem", "Avatar", "Image", "Metric", "Badge", "Timeline", "KeyValue", "Accordion", "Rating", "Progress", "Carousel", "Callout", "LeaveForm"]);
const PICTURE_PROPS = ["photo", "src", "cover"] as const;
const PRESS_ACTION = "runTool";

type PressAction = { action?: string; params?: { name?: string } };

function carouselPictures(props: Record<string, unknown>): string[] {
  const items = Array.isArray(props.items) ? (props.items as { src?: unknown }[]) : [];
  return items.map((item) => item?.src).filter((src): src is string => typeof src === "string" && src.length > 0);
}

function picturesIn(spec: Spec | null): string[] {
  return elements(spec).flatMap((element) => {
    const props = propsOf(element);
    const direct = PICTURE_PROPS.map((key) => props[key]).filter((value): value is string => typeof value === "string" && value.length > 0);
    return [...direct, ...carouselPictures(props)];
  });
}

function pressedTools(spec: Spec | null): string[] {
  return elements(spec).flatMap((element) => {
    const press = (element as { on?: { press?: PressAction | PressAction[] } }).on?.press;
    const actions = Array.isArray(press) ? press : press ? [press] : [];
    return actions.filter((action) => action.action === PRESS_ACTION).map((action) => action.params?.name ?? "");
  });
}

function peopleChecks(turn: Turn, tool: NonNullable<EvalCase["expectPeople"]>): CheckResult[] {
  const called = turn.toolInputs.some((entry) => entry.tool === tool);
  const types = elements(turn.spec).map((element) => element.type);
  const composed = types.includes("Card") && types.some((type) => COMPOSED_TYPES.has(type)) && !types.includes("DataCard");
  const returned = JSON.stringify(turn.toolOutputs);
  const invented = picturesIn(turn.spec).filter((src) => !returned.includes(JSON.stringify(src)));
  return [
    check("calledTool", called, called ? `เรียก ${tool}` : `ไม่ได้เรียก ${tool}`),
    check("composedPeople", composed, `องค์ประกอบ: ${[...new Set(types)].join(", ") || "ไม่มี"}`),
    check("picturesGrounded", invented.length === 0, invented.length === 0 ? "ทุกรูปมาจากผล tool" : `รูปที่ tool ไม่ได้ส่ง: ${invented.slice(0, 3).join(", ")}`),
  ];
}

const READ_TOOLS: ReadonlySet<string> = new Set(TOOL_SURFACE.filter((entry) => entry.tier === "read").map((entry) => entry.name));

function pressAsksCheck(turn: Turn): CheckResult {
  const direct = pressedTools(turn.spec).filter((name) => READ_TOOLS.has(name));
  return check("pressAsks", direct.length === 0, direct.length === 0 ? "ปุ่มถามต่อผ่าน ask หรือเป็นการลงมือทำ" : `ปุ่มเรียก tool อ่านข้อมูลตรง: ${[...new Set(direct)].join(", ")}`);
}

function carouselCheck(turn: Turn): CheckResult {
  const used = elements(turn.spec).some((element) => element.type === "Carousel");
  return check("noCarousel", !used, used ? "ใช้ Carousel กับชุดที่ต้องเห็นครบหรือต้องเทียบ" : "ไม่ใช้ Carousel");
}

function pressCheck(turn: Turn, tool: string): CheckResult {
  const pressed = pressedTools(turn.spec);
  return check("pressBound", pressed.includes(tool), pressed.length > 0 ? `ปุ่มเรียก ${[...new Set(pressed)].join(", ")}` : `ไม่มีปุ่มเรียก ${tool}`);
}

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
    results.push(cutCheck(turn, testCase.expectSort));
  }
  if (testCase.expectCompare) results.push(comparedCheck(turn, testCase.expectCompare));
  if (testCase.expectShape) results.push(shapeCheck(turn, props, testCase.expectShape));
  if (testCase.expectPeople) results.push(...peopleChecks(turn, testCase.expectPeople));
  if (testCase.expectPress) results.push(pressCheck(turn, testCase.expectPress));
  if (testCase.expectPeople) results.push(pressAsksCheck(turn));
  if (testCase.forbidCarousel) results.push(carouselCheck(turn));
  results.push(groundedCheck(turn.spec, turn.toolOutputs));
  return results;
}

export function scoreOf(results: CheckResult[]): { passed: number; total: number } {
  return { passed: results.filter((result) => result.ok).length, total: results.length };
}
