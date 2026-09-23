import type { Spec, SpecElement } from "vexa/protocol";
import type { MetricHeadline, MetricQuery, Provenance } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { formatDateTh } from "@/lib/i18n/format";

type Props = Record<string, unknown>;
type Answer = { query: MetricQuery; headline: MetricHeadline; provenance: Provenance; summary?: string };

const TOOL_PREFIX = "/tools/";
const SUMMARY_MATCH_CHARS = 24;
const DELTA_LABEL = /(%|เทียบ|เปลี่ยนแปลง|delta|change)/i;
const NUMERIC_LABEL = /(ยอด|จำนวน|มูลค่า|ปริมาณ|อัตรา|วัน|บาท|%|value|total|amount)/i;

function isAnswer(value: unknown): value is Answer {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Answer>;
  return Boolean(candidate.query && candidate.headline && candidate.provenance);
}

function answersIn(toolOutputs: Record<string, unknown>): Answer[] {
  return Object.entries(toolOutputs)
    .filter(([path]) => path.startsWith(TOOL_PREFIX) && !path.includes("."))
    .map(([, value]) => value)
    .filter(isAnswer);
}

function summariesIn(toolOutputs: Record<string, unknown>): string[] {
  return Object.values(toolOutputs)
    .map((output) => (typeof output === "object" && output !== null ? (output as { summary?: unknown }).summary : null))
    .filter((summary): summary is string => typeof summary === "string" && summary.length > SUMMARY_MATCH_CHARS);
}

function echoesSummary(value: unknown, summaries: string[]): boolean {
  if (typeof value !== "string") return false;
  return summaries.some((summary) => value.includes(summary.slice(0, SUMMARY_MATCH_CHARS)) || summary.includes(value.slice(0, SUMMARY_MATCH_CHARS)));
}

function scopeOf(answer: Answer): string {
  const dim = answer.query.dims.find((entry) => !["date", "week", "month"].includes(entry));
  const unit = dim ? TH.dash.dimUnit[dim] : null;
  return TH.dash.scope(answer.headline.periodLabel, unit && answer.headline.rowCount > 1 ? `${answer.headline.rowCount} ${unit}` : null);
}

function footnoteOf(answer: Answer): string {
  return TH.dash.provenance(answer.provenance.sourceSystem, TH.dash.trust[answer.provenance.trust], formatDateTh(answer.provenance.asOf));
}

function normalizedCard(props: Props, answer: Answer | null, summaries: string[]): Props {
  const next: Props = { ...props };
  if (echoesSummary(next.description, summaries)) next.description = null;
  if (!answer) return next;
  if (typeof next.meta !== "string" || next.meta.length === 0) next.meta = scopeOf(answer);
  if (typeof next.footnote !== "string" || next.footnote.length === 0) next.footnote = footnoteOf(answer);
  return next;
}

function normalizedColumn(column: Props, rows: Props[]): Props {
  const key = String(column.key ?? "");
  const label = String(column.label ?? "");
  const sample = rows.map((row) => row[key]).find((value) => value !== undefined && value !== null);
  const looksSigned = typeof sample === "string" && /^[+-]/.test(sample.trim());
  const next: Props = { ...column };
  if (next.align === undefined || next.align === null) {
    next.align = looksSigned || typeof sample === "number" || NUMERIC_LABEL.test(label) ? "end" : null;
  }
  if ((next.tone === undefined || next.tone === null) && looksSigned && DELTA_LABEL.test(label)) next.tone = "delta";
  return next;
}

function normalizedTable(props: Props): Props {
  const columns = Array.isArray(props.columns) ? (props.columns as Props[]) : null;
  const rows = Array.isArray(props.rows) ? (props.rows as Props[]) : [];
  if (!columns || columns.length === 0) return props;
  return { ...props, columns: columns.map((column) => normalizedColumn(column, rows)) };
}

function normalizedElement(element: SpecElement, answer: Answer | null, summaries: string[]): SpecElement {
  const props = (element.props ?? {}) as Props;
  if (element.type === "Card") return { ...element, props: normalizedCard(props, answer, summaries) } as SpecElement;
  if (element.type === "Table") return { ...element, props: normalizedTable(props) } as SpecElement;
  if (element.type === "Text" && echoesSummary(props.content, summaries)) {
    return { ...element, props: { ...props, content: "" } } as SpecElement;
  }
  return element;
}

/**
 * The safety net for a card the model drew by hand: drop prose that only repeats a tool summary, fill the scope and
 * source lines from provenance, and align number columns. It never moves elements — only the props it can be sure of.
 */
export function normalizeCopSpec(spec: Spec, context: { toolOutputs: Record<string, unknown> }): Spec {
  const elements = spec.elements as Record<string, SpecElement> | undefined;
  if (!elements) return spec;
  const answers = answersIn(context.toolOutputs);
  const answer = answers.length === 1 ? answers[0] : null;
  const summaries = summariesIn(context.toolOutputs);
  if (!answer && summaries.length === 0) return spec;
  const next: Record<string, SpecElement> = {};
  let changed = false;
  for (const [id, element] of Object.entries(elements)) {
    const updated = normalizedElement(element, answer, summaries);
    if (updated !== element) changed = true;
    next[id] = updated;
  }
  return changed ? ({ ...spec, elements: next } as Spec) : spec;
}
