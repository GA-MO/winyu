import { liveAccessFor } from "@/lib/access/enforce";
import { presentCard } from "@/lib/cards/present";
import { ASK_EVENT, COMPOSE_ACTION_TOOLS, type ComposedComponent } from "@/lib/compose/catalog";
import { REGIONS, setPermissionInputSchema, watchMetricInputSchema, type MetricQuery, type MetricResult, type Region } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TODAY } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { EvalCase } from "./cases";
import type { DrawnCard, EvalTurn } from "./recording";

/** One check's verdict on one turn. */
export type Verdict = { ok: boolean; detail: string };

/** A deterministic check of one recorded turn against its case; `verdict` returns null when the check has nothing to judge in this case. */
export type EvalCheck = { id: string; description: string; verdict: (turn: EvalTurn, expected: EvalCase) => Verdict | null };

type MetricAnswer = { query: MetricQuery; result: Extract<MetricResult, { ok: true }> };

const METRIC_TOOL = "query_metric";
const ENGINE_DEFAULT_SORT = "value_desc";
const CONNECTOR_SEPARATOR = "__";
const COMPOSED_READS: ReadonlySet<string> = new Set(["find_people", "get_person", "get_site", "list_candidates", "list_courses", "get_policy", "resolve_owner", "describe_entity"]);
const NUMBER_IN_TEXT = /-?\d[\d,.]{2,}/g;
const DIGIT = /[0-9๐-๙]/;
const ISO_YEAR = /\b(\d{4})-\d{2}-\d{2}/g;
const BUDDHIST_ERA_OFFSET = 543;
const NON_TEXT_PROPS: ReadonlySet<string> = new Set(["id", "component", "children", "action", "media", "tone", "variant"]);
const FIELD_NAME_PROPS: Partial<Record<string, readonly string[]>> = { RankList: ["label", "value", "note"], Table: ["columns"] };
const PICTURE_PROPS = ["src"] as const;
const PRESS_EVENTS: ReadonlySet<string> = new Set([ASK_EVENT, ...COMPOSE_ACTION_TOOLS]);
const APPROVAL_SCHEMAS: Partial<Record<string, { safeParse: (value: unknown) => { success: boolean } }>> = { watch_metric: watchMetricInputSchema, set_permission: setPermissionInputSchema };
const REGION_IDS: ReadonlySet<string> = new Set(REGIONS);
const TIME_UNIT_DIMS: ReadonlySet<string> = new Set(["date", "week", "month"]);
const GROUP_UNITS = Object.entries(TH.dash.dimUnit).filter(([dim]) => !TIME_UNIT_DIMS.has(dim)).map(([, unit]) => unit);
const COUNT_UNITS = [...new Set([...GROUP_UNITS, TH.dash.item, "แห่ง", "ตัว", "ราย"])].join("|");
const ONE_ALONE = /(รายการ|แห่ง|ภาค|ตัว|ราย|จังหวัด|แบรนด์|ช่องทาง)เดียว|หนึ่ง(รายการ|แห่ง|ภาค|ตัว|ราย)/;

function verdict(ok: boolean, detail: string): Verdict {
  return { ok, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPath(value: unknown): value is { path: string } {
  return isRecord(value) && typeof value.path === "string";
}

function returned(turn: EvalTurn): DrawnCard[] {
  return turn.calls.flatMap((call) => ("result" in call ? [{ tool: call.tool, args: call.args, result: call.result }] : []));
}

function metricAnswerOf(card: DrawnCard): MetricAnswer | null {
  if (!isRecord(card.result) || card.result.ok !== true || !isRecord(card.result.query)) return null;
  return { query: card.result.query as unknown as MetricQuery, result: card.result as unknown as MetricAnswer["result"] };
}

/** The metric card that answers: the last `query_metric` card the chat draws. */
function answerCard(turn: EvalTurn): MetricAnswer | null {
  const answers = turn.cards.filter((card) => card.tool === METRIC_TOOL).flatMap((card) => metricAnswerOf(card) ?? []);
  return answers.at(-1) ?? null;
}

function metricQueries(turn: EvalTurn): MetricQuery[] {
  return turn.calls.filter((call) => call.tool === METRIC_TOOL).map((call) => {
    const resolved = "result" in call && isRecord(call.result) && isRecord(call.result.query) ? call.result.query : call.args;
    return resolved as MetricQuery;
  });
}

function expectedTool(expected: EvalCase): string | null {
  if (expected.expectApproval) return expected.expectApproval;
  if (expected.expectPeople) return expected.expectPeople;
  return expected.expectCard ?? null;
}

function components(turn: EvalTurn): ComposedComponent[] {
  return turn.composed?.components ?? [];
}

function isComposedRead(tool: string): boolean {
  return COMPOSED_READS.has(tool) || tool.includes(CONNECTOR_SEPARATOR);
}

function composableReads(turn: EvalTurn): DrawnCard[] {
  return returned(turn).filter((call) => isComposedRead(call.tool) && isRecord(call.result) && call.result.ok !== false);
}

function canonicalNumber(text: string): string {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? String(value) : text;
}

function numbersIn(value: unknown, found: Set<string>): Set<string> {
  if (typeof value === "number") found.add(String(value));
  if (typeof value === "string") for (const match of value.match(NUMBER_IN_TEXT) ?? []) found.add(canonicalNumber(match.replace(/[.,]$/, "")));
  if (Array.isArray(value)) for (const item of value) numbersIn(item, found);
  if (isRecord(value)) for (const item of Object.values(value)) numbersIn(item, found);
  return found;
}

function yearsIn(value: unknown, found: Set<string>): Set<string> {
  for (const match of (JSON.stringify(value) ?? "").matchAll(ISO_YEAR)) {
    const year = Number(match[1]);
    found.add(String(year));
    found.add(String(year + BUDDHIST_ERA_OFFSET));
  }
  return found;
}

function pointer(root: unknown, path: string): unknown {
  return path.split("/").filter(Boolean).reduce<unknown>((node, key) => (Array.isArray(node) ? node[Number(key)] : isRecord(node) ? node[key] : undefined), root);
}

function templateBases(parts: readonly ComposedComponent[]): Map<string, string> {
  const bases = new Map<string, string>();
  for (const part of parts) {
    const children = part.children;
    if (isRecord(children) && typeof children.componentId === "string" && typeof children.path === "string") bases.set(children.componentId, children.path);
  }
  return bases;
}

function textProps(part: ComposedComponent): [string, unknown][] {
  const fieldNames = FIELD_NAME_PROPS[part.component] ?? [];
  return Object.entries(part).filter(([prop]) => !NON_TEXT_PROPS.has(prop) && !fieldNames.includes(prop));
}

function boundValues(value: unknown): unknown[] {
  if (isPath(value)) return [value];
  if (Array.isArray(value)) return value.flatMap((item) => (isRecord(item) ? Object.values(item).flatMap(boundValues) : boundValues(item)));
  return [value];
}

function unresolved(path: string, base: string | null, dataModel: Record<string, unknown>): boolean {
  if (path.startsWith("/")) return pointer(dataModel, path) === undefined;
  const list = base ? pointer(dataModel, base) : undefined;
  return !Array.isArray(list) || !list.some((item) => pointer(item, path) !== undefined);
}

function cardGrounding(turn: EvalTurn): string[] {
  const parts = components(turn);
  const bases = templateBases(parts);
  const dataModel = turn.composed?.dataModel ?? {};
  return parts.flatMap((part) => textProps(part).flatMap(([prop, value]) => boundValues(value).flatMap((bound) => {
    if (isPath(bound)) return unresolved(bound.path, bases.get(part.id) ?? null, dataModel) ? [`${part.id}.${prop} → ${bound.path} ไม่มีในผล tool`] : [];
    if (typeof bound === "string" && DIGIT.test(bound)) return [`${part.id}.${prop} = "${bound}" มีตัวเลขพิมพ์เอง`];
    return [];
  })));
}

function picturesOf(turn: EvalTurn): string[] {
  return components(turn).flatMap((part) => PICTURE_PROPS.map((prop) => part[prop]).filter((value): value is string => typeof value === "string" && value.length > 0));
}

function pressEvents(turn: EvalTurn): string[] {
  return components(turn).flatMap((part) => {
    const action = part.action;
    const name = isRecord(action) && isRecord(action.event) ? action.event.name : null;
    return typeof name === "string" ? [name] : [];
  });
}

function regionsIn(value: unknown, found: Set<string>, underRegion = false): Set<string> {
  if (typeof value === "string" && underRegion && REGION_IDS.has(value)) found.add(value);
  if (Array.isArray(value)) for (const item of value) regionsIn(item, found, underRegion);
  if (isRecord(value)) for (const [key, item] of Object.entries(value)) regionsIn(item, found, key === "region");
  return found;
}

function allowedRegions(userId: string): readonly Region[] | "all" {
  const user = findUser(userId);
  return user ? liveAccessFor(user).regions : "all";
}

function repeatsCount(text: string, count: number): boolean {
  if (new RegExp(`(^|[^\\d.,])${count}\\s*(จาก|${COUNT_UNITS})`).test(text)) return true;
  return count === 1 && ONE_ALONE.test(text);
}

function sameSlice(queries: readonly MetricQuery[]): boolean {
  const slices = new Set(queries.map((query) => JSON.stringify([[...query.dims].sort(), query.range.from, query.range.to])));
  return slices.size <= 1;
}

function readEnd(to: string | undefined): string | undefined {
  return to !== undefined && to > TODAY ? TODAY : to;
}

/** Every check a recorded turn is scored with: Winyu's `eval:cards` checks translated to what mascop draws (the fixed card from `present.ts`, the A2UI card the model composes, the approval it asks), plus mascop's own grounding, composition and scope checks. */
export const EVAL_CHECKS: readonly EvalCheck[] = [
  {
    id: "calledTool",
    description: "The answer called at least one tool.",
    verdict: (turn) => verdict(turn.calls.length > 0, `เรียก tool ${turn.calls.length} ครั้ง${turn.recording.error ? ` · ${turn.recording.error}` : ""}`),
  },
  {
    id: "rightTool",
    description: "The tool the question is about was called.",
    verdict: (turn, expected) => {
      const tool = expectedTool(expected);
      if (!tool) return null;
      const called = turn.calls.map((call) => call.tool);
      return verdict(called.includes(tool), `คาดว่า ${tool} · เรียก ${called.join(", ") || "ไม่มี"}`);
    },
  },
  {
    id: "askedApproval",
    description: "The write the person asked for paused for approval, with arguments its schema accepts.",
    verdict: (turn, expected) => {
      if (!expected.expectApproval) return null;
      const asked = turn.calls.find((call) => call.tool === expected.expectApproval);
      const schema = APPROVAL_SCHEMAS[expected.expectApproval];
      const valid = asked !== undefined && (!schema || schema.safeParse(asked.args).success);
      const paused = turn.recording.asked.includes(expected.expectApproval);
      return verdict(valid && paused, asked ? `input ${valid ? "ถูกต้อง" : "ไม่ผ่าน schema"} · ${paused ? "รออนุมัติ" : "ไม่ได้ขออนุมัติ"}` : `ไม่ได้เรียก ${expected.expectApproval}`);
    },
  },
  {
    id: "rightPermission",
    description: "set_permission names the role, kind, key and value the admin asked for.",
    verdict: (turn, expected) => {
      if (!expected.expectPermission) return null;
      const asked = turn.calls.find((call) => call.tool === "set_permission")?.args;
      const wanted = expected.expectPermission;
      const same = isRecord(asked) && (Object.keys(wanted) as (keyof typeof wanted)[]).every((field) => asked[field] === wanted[field]);
      return verdict(same, `ได้ ${JSON.stringify(asked ?? null)} คาดว่า ${JSON.stringify(wanted)}`);
    },
  },
  {
    id: "drewCard",
    description: "The fixed card of the expected metric tool draws an answer (an ok, non-empty result).",
    verdict: (turn, expected) => {
      if (!expected.expectCard) return null;
      const drawn = turn.cards.filter((card) => card.tool === expected.expectCard);
      const answered = drawn.some((card) => isRecord(card.result) && card.result.ok !== false);
      return verdict(answered, `การ์ดที่วาด: ${turn.cards.map((card) => card.tool).join(", ") || "ไม่มี"} คาดว่า ${expected.expectCard}`);
    },
  },
  {
    id: "sortedRight",
    description: "The answering metric card is ordered the way the question ranks (its query's sort).",
    verdict: (turn, expected) => {
      if (!expected.expectSort) return null;
      const sort = answerCard(turn)?.query.sort ?? null;
      return verdict(sort === expected.expectSort, `sort = ${String(sort)} คาดว่า ${expected.expectSort}`);
    },
  },
  {
    id: "cutRight",
    description: "A limited query is ranked the way the card is ordered, so the limit keeps the right rows.",
    verdict: (turn, expected) => {
      if (!expected.expectSort) return null;
      const limited = metricQueries(turn).filter((query) => typeof query.limit === "number");
      if (limited.length === 0) return verdict(true, "ไม่ได้ตัดด้วย limit");
      const wrong = limited.filter((query) => (query.sort ?? ENGINE_DEFAULT_SORT) !== expected.expectSort);
      return verdict(wrong.length === 0, wrong.length === 0 ? `sort = ${expected.expectSort} ก่อนตัด` : `ตัดด้วย limit แต่ sort = ${String(wrong[0].sort ?? "ไม่ได้ส่ง")} คาดว่า ${expected.expectSort}`);
    },
  },
  {
    id: "comparedRight",
    description: "A query compares with the period and range the question means.",
    verdict: (turn, expected) => {
      const wanted = expected.expectCompare;
      if (!wanted) return null;
      const queries = metricQueries(turn);
      const matches = queries.some((query) => query.compare === wanted.compare && (!wanted.range || (query.range?.from === wanted.range.from && readEnd(query.range?.to) === wanted.range.to)));
      const got = queries.map((query) => `${query.compare ?? "?"} ${query.range?.from ?? "?"}..${query.range?.to ?? "?"}`).join(" · ") || "ไม่ได้ query";
      return verdict(matches, `ได้ ${got} คาดว่า ${wanted.compare}${wanted.range ? ` ${wanted.range.from}..${wanted.range.to}` : ""}`);
    },
  },
  {
    id: "drewShape",
    description: "present.ts draws the answering card in the shape the question needs.",
    verdict: (turn, expected) => {
      if (!expected.expectShape) return null;
      const answer = answerCard(turn);
      if (!answer) return verdict(false, "ไม่มีการ์ด query_metric ที่ตอบได้");
      const body = presentCard({ title: metricLabel(answer.query.metric), query: answer.query, result: answer.result, view: "auto", sortBy: null }).body;
      return verdict(body.kind === expected.expectShape, `วาดเป็น ${body.kind} คาดว่า ${expected.expectShape} (dims ${answer.query.dims.join(",") || "-"})`);
    },
  },
  {
    id: "pairedMetrics",
    description: "Every metric a multi-metric question names is queried, all with the same dims and range.",
    verdict: (turn, expected) => {
      if (!expected.expectMetrics) return null;
      const queries = metricQueries(turn);
      const picked = expected.expectMetrics.map((choices) => queries.find((query) => choices.includes(query.metric)) ?? null);
      const missing = expected.expectMetrics.filter((_, index) => picked[index] === null).map((choices) => choices.join("|"));
      const found = picked.filter((query): query is MetricQuery => query !== null);
      const aligned = sameSlice(found);
      return verdict(missing.length === 0 && aligned, missing.length > 0 ? `ไม่ได้ query: ${missing.join(", ")}` : aligned ? `ครบ ${found.map((query) => query.metric).join(", ")} ช่วงเดียวกัน` : "dims หรือช่วงเวลาไม่ตรงกัน");
    },
  },
  {
    id: "countNotRepeated",
    description: "The reply does not repeat the under-the-line count the card's headline already shows.",
    verdict: (turn) => {
      const under = answerCard(turn)?.result.headline.underLine;
      if (!under || under.count === 0) return null;
      const repeated = repeatsCount(turn.words, under.count);
      return verdict(!repeated, repeated ? `ทวนจำนวน ${under.count}: "${turn.words.slice(0, 80)}"` : `หัวการ์ด ${under.count} จาก ${under.of} ไม่ถูกทวน`);
    },
  },
  {
    id: "composed",
    description: "An answer that shows people, sites, courses, candidates, policies, owners, entities or connector rows is one composed card (a lookup behind a metric card is not such an answer).",
    verdict: (turn, expected) => {
      const reads = composableReads(turn);
      if (!expected.expectPeople && (expected.expectCard || reads.length === 0)) return null;
      const held = components(turn).length > 0;
      return verdict(held, held ? `การ์ดประกอบ ${components(turn).length} ชิ้นจาก ${reads.map((read) => read.tool).join(", ")}` : `ไม่มีการ์ดประกอบ (อ่าน ${reads.map((read) => read.tool).join(", ") || "ไม่มี"}) · การ์ดตายตัว ${turn.cards.map((card) => card.tool).join(", ") || "ไม่มี"}`);
    },
  },
  {
    id: "blockHeld",
    description: "Every line of the model's card block passes the composer's checks.",
    verdict: (turn) => {
      if (!turn.composed) return null;
      return verdict(turn.composed.rejected === 0, turn.composed.rejected === 0 ? `ผ่าน ${turn.composed.accepted} บรรทัด` : `ตัด ${turn.composed.rejected} บรรทัด: ${turn.composed.problems.slice(0, 2).join("; ")}`);
    },
  },
  {
    id: "groundedCard",
    description: "The composed card types no digit itself and every path it reads exists in the tool results.",
    verdict: (turn) => {
      if (components(turn).length === 0) return null;
      const problems = cardGrounding(turn);
      return verdict(problems.length === 0, problems.length === 0 ? "ทุกค่ามาจาก path ในผล tool" : problems.slice(0, 3).join("; "));
    },
  },
  {
    id: "groundedWords",
    description: "Every number in the reply text is in a tool result, the question or a date the data covers.",
    verdict: (turn) => {
      const known = numbersIn(returned(turn).map((call) => call.result), new Set());
      numbersIn(turn.recording.prompt, known);
      yearsIn(returned(turn).map((call) => call.result), known);
      yearsIn(TODAY, known);
      const invented = [...numbersIn(turn.words, new Set())].filter((value) => !known.has(value));
      return verdict(invented.length === 0, invented.length === 0 ? "ทุกตัวเลขในข้อความอยู่ในผล tool" : `ตัวเลขที่ไม่มีในผล tool: ${invented.slice(0, 5).join(", ")}`);
    },
  },
  {
    id: "picturesGrounded",
    description: "Every picture on the composed card is one a tool returned.",
    verdict: (turn) => {
      const literal = picturesOf(turn);
      if (components(turn).length === 0) return null;
      const results = JSON.stringify(returned(turn).map((call) => call.result));
      const invented = literal.filter((src) => !results.includes(JSON.stringify(src)));
      return verdict(invented.length === 0, invented.length === 0 ? "ทุกรูปมาจากผล tool" : `รูปที่ tool ไม่ได้ส่ง: ${invented.slice(0, 3).join(", ")}`);
    },
  },
  {
    id: "pressBound",
    description: "The composed card offers the press the question calls for (ask a follow-up, or enrol).",
    verdict: (turn, expected) => {
      if (!expected.expectPress) return null;
      const events = pressEvents(turn);
      return verdict(events.includes(expected.expectPress), events.length > 0 ? `ปุ่ม ${[...new Set(events)].join(", ")}` : `ไม่มีปุ่ม ${expected.expectPress}`);
    },
  },
  {
    id: "pressAsks",
    description: "A composed button asks a question or starts an allowed write; it never runs a read tool directly.",
    verdict: (turn) => {
      if (components(turn).length === 0) return null;
      const direct = pressEvents(turn).filter((name) => !PRESS_EVENTS.has(name));
      return verdict(direct.length === 0, direct.length === 0 ? "ปุ่มถามต่อผ่าน ask หรือเป็นการลงมือทำ" : `ปุ่มที่ไม่รู้จัก: ${[...new Set(direct)].join(", ")}`);
    },
  },
  {
    id: "noCarousel",
    description: "A set the person must see whole or compare is not hidden in a carousel.",
    verdict: (turn, expected) => {
      if (!expected.forbidCarousel) return null;
      const used = components(turn).some((part) => part.component === "Carousel");
      return verdict(!used, used ? "ใช้ Carousel กับชุดที่ต้องเห็นครบหรือต้องเทียบ" : "ไม่ใช้ Carousel");
    },
  },
  {
    id: "inScope",
    description: "A person with a regional scope sees no row, person or card value from another region.",
    verdict: (turn) => {
      const allowed = allowedRegions(turn.recording.userId);
      if (allowed === "all") return null;
      const seen = regionsIn([returned(turn).map((call) => call.result), turn.composed?.dataModel ?? {}], new Set());
      const outside = [...seen].filter((region) => !allowed.includes(region as Region));
      return verdict(outside.length === 0, outside.length === 0 ? `เห็นเฉพาะ ${allowed.join(", ")}` : `เห็นภาคนอกขอบเขต: ${outside.join(", ")}`);
    },
  },
];
