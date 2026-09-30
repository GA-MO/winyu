import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AccessContext, Alert, Dim, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { presentCard, presentForecast, type ForecastAnswer, type SortBy } from "@/lib/cards/present";
import { formatMetricValue } from "@/lib/dashboard/metric-display";
import { TODAY, addDays, weekKeyOfIso } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { forecastSlice } from "@/lib/engine/forecast-slice";
import { quickActionsFrom } from "@/lib/engine/recommend";
import { formatDateTh, formatTimeTh, periodLabelTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { forecastsFor } from "@/lib/server/alerts";
import { loadDictionary } from "@/lib/server/master-data";
import { runMetric } from "@/lib/server/metrics";
import { actionsForMetric } from "@/lib/server/next-actions";
import { defaultActionsFor } from "@/lib/server/quick-actions";

const DATA_DIR = path.join(process.cwd(), ".data");
const TRACE_DIR = path.join(process.cwd(), "sim", "investigations");
const OUTPUT = path.join(process.cwd(), "site", "app", "data", "booth-data.json");

const INVESTIGATOR = "u_prasit";
const CHIP_LEARNER = "u_krit";
const MEMORY_HOLDER = "u_anucha";
const SUGGESTION_OWNER = "u_anucha";
const ANOMALY_ID = "al_7364476d77c8f435";
const FORECAST_DIMS: Partial<Record<Dim, string>> = { brand: "leo", region: "northeast" };
const FORECAST_WEEKS = 8;
const CHIPS_AT = Date.parse("2026-09-28T01:30:00.000Z");
const TRACE_LINES = 12;
const TRACE_SUMMARY_CHARS = 78;
const SKIPPED_TOOLS = new Set(["recall_memory"]);
const LAST_TWELVE_WEEKS = { from: addDays(TODAY, -83), to: TODAY };

type Story = { kind: "urgent" | "watch" | "ok"; finding: string; scope: string; evidence: { title: string; query: MetricQuery } | null; ruledOut: { text: string }[]; action: string | null };
type Investigation = { userId: string; at: string; checkedCount: number; stories: Story[] };
type TraceCall = { tool: string; input: Record<string, unknown>; output: { summary?: string; rows?: { id?: string; scopeLabel?: string }[] } | null };
type MemoryRecord = { userId: string; type: string; value: string; seen: number; confidence: number };
type Widget = { userId: string; title: string; query: MetricQuery; source: string; reason: string | null };
type Outcome = { key: string; verdict: "real" | "noise"; outcome: string; byUserId: string; at: string };

function readData<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
}

function personaOf(userId: string): { access: AccessContext; role: string } {
  const user = findUser(userId);
  if (!user) throw new Error(`Unknown persona ${userId}`);
  return { access: accessFor(user), role: user.title };
}

async function cardFor(access: AccessContext, title: string, query: MetricQuery) {
  const result = await runMetric(query, access);
  if (!result.ok) throw new Error(`${title}: ${result.error}`);
  const sortBy = (query.sort ?? null) as SortBy | null;
  const parts = presentCard({ title, query, result, sortBy, actions: actionsForMetric(access, query, result, await loadDictionary()) });
  return { ...parts, actions: parts.actions.filter((action) => action.kind !== "handoff") };
}

function toolLabel(tool: string): string {
  const labels = TH.admin.tools as Record<string, { label: string } | undefined>;
  return labels[tool]?.label ?? tool;
}

function traceCalls(userId: string): TraceCall[] {
  return (JSON.parse(readFileSync(path.join(TRACE_DIR, `${userId}.json`), "utf8")) as { calls: TraceCall[] }).calls;
}

function alertScopeLabel(alertId: string): string | null {
  const rows = traceCalls(INVESTIGATOR).flatMap((call) => (call.tool === "get_alerts" ? (call.output?.rows ?? []) : []));
  return rows.find((row) => row.id === alertId)?.scopeLabel ?? null;
}

function traceOf(userId: string) {
  return traceCalls(userId)
    .filter((call) => !SKIPPED_TOOLS.has(call.tool) && Boolean(call.output?.summary))
    .slice(0, TRACE_LINES)
    .map((call) => {
      const split = typeof call.input.split === "string" ? ` · แยกตาม${TH.dash.dimUnit[call.input.split] ?? call.input.split}` : "";
      const summary = call.output?.summary ?? "";
      return { tool: call.tool, label: `${toolLabel(call.tool)}${split}`, summary: summary.length > TRACE_SUMMARY_CHARS ? `${summary.slice(0, TRACE_SUMMARY_CHARS)}…` : summary };
    });
}

async function investigation() {
  const record = readData<Investigation[]>("investigations.json").find((entry) => entry.userId === INVESTIGATOR);
  if (!record) throw new Error(`No investigation for ${INVESTIGATOR}`);
  const story = record.stories.find((entry) => entry.kind === "urgent" && entry.evidence && entry.ruledOut.length > 0);
  if (!story?.evidence) throw new Error("No urgent story with evidence and ruled-out causes");
  const { access, role } = personaOf(INVESTIGATOR);
  return {
    role,
    ranAt: TH.stories.ranAt(formatTimeTh(record.at), formatDateTh(TODAY)),
    looked: TH.stories.looked(record.checkedCount),
    checked: record.checkedCount,
    trace: traceOf(INVESTIGATOR),
    story: { kind: TH.stories.kind[story.kind], scope: story.scope, finding: story.finding, ruledOut: story.ruledOut.map((cause) => cause.text), action: story.action },
    card: await cardFor(access, story.evidence.title, story.evidence.query),
  };
}

function chips() {
  const { access, role } = personaOf(CHIP_LEARNER);
  const items = quickActionsFrom(access, defaultActionsFor(access), CHIPS_AT).map((action) => ({ label: action.label, reason: action.reason }));
  return { role, items };
}

function memory() {
  const { role } = personaOf(MEMORY_HOLDER);
  const facts = readData<MemoryRecord[]>("memory.json")
    .filter((fact) => fact.userId === MEMORY_HOLDER)
    .map((fact) => ({ type: fact.type, value: fact.value, seen: fact.seen }));
  return { role, title: TH.memoryPage.title, learning: TH.memoryPage.learningTitle(facts.length), confirm: TH.memoryPage.yes, facts };
}

async function suggestion() {
  const layouts = readData<{ userId: string; widgets: Widget[] }[]>("layouts.json");
  const widget = layouts.find((layout) => layout.userId === SUGGESTION_OWNER)?.widgets.find((entry) => entry.source === "ai_suggested" && entry.reason);
  if (!widget) throw new Error(`No suggested card for ${SUGGESTION_OWNER}`);
  const { access, role } = personaOf(SUGGESTION_OWNER);
  return { role, badge: TH.dash.winyuSuggests, reason: widget.reason, keep: TH.dash.keepSuggestion, source: TH.dash.source.ai_suggested, card: await cardFor(access, widget.title, widget.query) };
}

function thresholdKeyOf(alert: Alert): string {
  const dims = Object.entries(alert.dims)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dim, value]) => `${dim}=${value}`);
  return [alert.metric, ...dims].join("|");
}

async function anomaly() {
  const alert = readData<Alert[]>("alerts.json").find((entry) => entry.id === ANOMALY_ID);
  if (!alert) throw new Error(`No alert ${ANOMALY_ID}`);
  const { access, role } = personaOf(alert.ownerUserId);
  const outcome = readData<Outcome[]>("alert-outcomes.json").find((entry) => entry.key === thresholdKeyOf(alert));
  const lessonRole = outcome ? (findUser(outcome.byUserId)?.title ?? outcome.byUserId) : null;
  const agent = alert.dims.agent;
  if (!agent) throw new Error(`Alert ${ANOMALY_ID} has no agent`);
  const weekly: MetricQuery = { metric: alert.metric, dims: ["week"], filters: { agent: [agent] }, range: LAST_TWELVE_WEEKS, grain: "week", compare: "none", limit: 20 };
  const scope = alertScopeLabel(alert.id);
  if (!scope) throw new Error(`No scope label for ${ANOMALY_ID} in the trace`);
  const card = await cardFor(access, `ยอดขายเข้ารายสัปดาห์ · ${scope}`, weekly);
  return {
    role,
    scope,
    severity: alert.severity,
    observed: formatMetricValue(alert.metric, alert.observed),
    expected: formatMetricValue(alert.metric, alert.expected),
    gap: `${Math.round((1 - alert.observed / alert.expected) * 100)}%`,
    hypothesis: alert.hypothesis,
    lesson: outcome && lessonRole ? TH.lesson.line(TH.lesson.verdict[outcome.verdict], outcome.outcome, lessonRole, formatDateTh(outcome.at)) : null,
    card,
  };
}

async function forecast() {
  const { access, role } = personaOf(MEMORY_HOLDER);
  const slice = forecastSlice(forecastsFor(access), "net_sales_volume", FORECAST_DIMS);
  if (!slice?.ok) throw new Error("No Leo northeast forecast");
  const weeks = slice.points.slice(0, FORECAST_WEEKS).map((point) => ({
    week: periodLabelTh(weekKeyOfIso(point.date)),
    date: point.date,
    value: Math.round(point.value),
    lo: Math.round(point.lo),
    hi: Math.round(point.hi),
    value_label: formatMetricValue("net_sales_volume", Math.round(point.value)),
  }));
  const answer: ForecastAnswer = { metric: "net_sales_volume", total: weeks.reduce((sum, point) => sum + point.value, 0), mape: slice.mape, weeks };
  const historyQuery: MetricQuery = { metric: "net_sales_volume", dims: ["week"], filters: { brand: ["leo"] }, range: LAST_TWELVE_WEEKS, grain: "week", compare: "none", limit: 20 };
  const historyResult = await runMetric(historyQuery, access);
  const card = presentForecast({ title: "ลีโอ ภาคอีสาน · พยากรณ์ 8 สัปดาห์", forecast: answer, history: { query: historyQuery, result: historyResult } });
  return { role, card };
}

const data = {
  investigation: await investigation(),
  chips: chips(),
  memory: memory(),
  suggestion: await suggestion(),
  anomaly: await anomaly(),
  forecast: await forecast(),
};

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
console.log(`investigation: ${data.investigation.trace.length} calls · ${data.investigation.story.finding}`);
console.log(`chips: ${data.chips.items.map((chip) => `${chip.label} (${chip.reason})`).join(" | ")}`);
console.log(`memory: ${data.memory.facts.map((fact) => fact.value).join(" | ")}`);
console.log(`suggestion: ${data.suggestion.card.title} · ${data.suggestion.reason}`);
console.log(`anomaly: ${data.anomaly.observed} vs ${data.anomaly.expected} · ${data.anomaly.lesson}`);
console.log(`forecast: ${data.forecast.card.hero?.value} · ${data.forecast.card.hero?.detail}`);
