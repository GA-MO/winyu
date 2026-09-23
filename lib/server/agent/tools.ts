import { randomUUID } from "node:crypto";
import { tool, type Tool, type ToolSet } from "ai";
import type { z } from "zod";
import { responsibleFor } from "@/lib/access/raci";
import { toolsFor } from "@/lib/access/enforce";
import {
  TOOL_SURFACE,
  createHandoffInputSchema,
  describeEntityInputSchema,
  getAlertsInputSchema,
  getCalendarInputSchema,
  getForecastInputSchema,
  listMetricsInputSchema,
  metricQuerySchema,
  pinWidgetInputSchema,
  watchMetricInputSchema,
  recallMemoryInputSchema,
  resolveOwnerInputSchema,
  runJobInputSchema,
  sendEmailInputSchema,
  type AccessContext,
  type Alert,
  type MetricQuery,
  type Dim,
  type Notification,
  type Region,
  type ToolName,
  type ToolTier,
  type WidgetSpec,
} from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { withAudit } from "@/lib/server/audit";
import { currentAccess, currentTurn, recordQuery } from "@/lib/server/request-context";
import { createPacket, digestOf, suggestOwner } from "@/lib/server/handoff";
import { threads } from "@/lib/server/threads-read";
import { TH } from "@/lib/i18n/th";
import { formatMetricValue, metricLabel } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatPercent } from "@/lib/i18n/format";
import { displayLabel } from "@/lib/semantic/dictionary";
import { layoutOf, layouts, memoryFacts, notifications, outbox, packets, type OutboxEntry } from "./collections";
import { allAlertsFor, forecastsFor, openAlertsFor, runAnomalyJob, runEngineJobs, runForecastJob } from "@/lib/server/alerts";
import { dataPort } from "./data-port";
import { actionsForAlert, actionsForMetric, followUpsForMetric } from "@/lib/server/next-actions";
import { alertRowOf } from "@/lib/cards/alert-row";
import { ADDITIVE_FORECAST_METRICS, forecastSlice } from "@/lib/engine/forecast-slice";
import { periodLabelTh } from "@/lib/i18n/format";
import { addDays, TODAY, toDayIndex, weekKeyOfIso } from "@/lib/data/dates";
import { calendarEvents, type CalendarEvent } from "@/lib/data/entities/calendar";
import { impactOf, type DailyBeer, type EventImpact } from "@/lib/engine/calendar-impact";
import { conditionLabel, createWatch, runWatchJob } from "@/lib/server/watches";
import { similarity } from "@/lib/engine/memory-match";
import { memoryStatus } from "@/lib/engine/memory-status";
import { runDigestJob } from "@/lib/server/digest";
import { lessonFor } from "@/lib/server/outcomes";

const NO_ALERTS = "ไม่พบความผิดปกติที่เปิดอยู่ในขอบเขตของผู้ใช้คนนี้";
const NO_FORECAST = "ยังไม่มีพยากรณ์สำหรับมิติที่ขอ";
const NO_MEMORY = "ยังไม่มีข้อมูลที่จำไว้เกี่ยวกับผู้ใช้คนนี้";
const DEFAULT_ALERT_LIMIT = 10;
const DEFAULT_MEMORY_LIMIT = 8;
const RECALL_MIN_SIMILARITY = 0.25;

function now(): string {
  return new Date().toISOString();
}

function regionOf(dims: Partial<Record<Dim, string>>): Region | null {
  return (dims.region as Region | undefined) ?? null;
}

function recipient(toUserId: string) {
  const user = findUser(toUserId);
  return user ? { ok: true as const, user } : { ok: false as const, error: `ไม่พบผู้ใช้ ${toUserId} ในระบบ` };
}

function mailEntry(entry: Omit<OutboxEntry, "id" | "at">): OutboxEntry {
  return outbox().put({ ...entry, id: randomUUID(), at: now() });
}

const MAX_EVIDENCE = 4;

function evidenceKey(query: { metric: string; filters: unknown; range: { from: string; to: string } }): string {
  return `${query.metric}|${JSON.stringify(query.filters)}|${query.range.from}|${query.range.to}`;
}

function mergeEvidence(explicit: MetricQuery[], ran: MetricQuery[]): MetricQuery[] {
  const merged = new Map<string, MetricQuery>();
  for (const query of [...explicit, ...ran]) merged.set(evidenceKey(query), query);
  return [...merged.values()].slice(0, MAX_EVIDENCE);
}

function textOf(message: unknown): string {
  const parts = (message as { parts?: { type?: string; text?: string }[] })?.parts ?? [];
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join(" ").trim();
}

function digestOfThread(threadId: string | null): string {
  if (!threadId) return "";
  const thread = threads().get(threadId);
  if (!thread) return "";
  return digestOf(thread.messages.map((message) => ({ role: (message as { role?: string }).role ?? "assistant", text: textOf(message) })));
}

function suggestedActionsFor(ask: string): string[] {
  return [TH.handoff.replies.accept, TH.handoff.replies.need_info, `ตรวจ: ${ask}`];
}

function notify(notification: Omit<Notification, "id" | "at" | "read">): Notification {
  return notifications().put({ ...notification, id: randomUUID(), at: now(), read: false });
}

const query_metric = tool({
  description:
    "Read one certified metric from the semantic layer. Call it for every number you report: volumes, values, attainment, days of cover, margin, AR, headcount. Group with dims, narrow with filters, use compare for prev_period / prev_year / target. With a limit, set sort to the order the question asks (delta_asc = fell most, delta_desc = grew most, value_asc = lowest, value_desc = highest): rows are ranked by it before the limit cuts, so \"top 10 that fell\" really is the ten that fell most.",
  inputSchema: metricQuerySchema,
  execute: withAudit("query_metric", async (input: z.infer<typeof metricQuerySchema>) => {
    recordQuery(input);
    const access = currentAccess();
    const result = dataPort().runMetric(input, access);
    if (!result.ok) return result;
    const nextActions = actionsForMetric(access, input, result);
    return { ...result, query: input, nextActions, followUps: followUpsForMetric(access, input, result, nextActions) };
  }),
});

const list_metrics = tool({
  description: "List the metrics this system can answer, with their Thai label, unit and synonyms. Call it when the user's wording is ambiguous or you are unsure a metric exists before querying it.",
  inputSchema: listMetricsInputSchema,
  execute: withAudit("list_metrics", async ({ search }: z.infer<typeof listMetricsInputSchema>) => {
    const defs = dataPort().listMetrics(search);
    const data = defs.map((def) => ({ id: def.id, labelTh: def.labelTh, unit: def.unit, dims: def.dims, certified: def.certified }));
    return { ok: true as const, summary: `พบ ${data.length} เมตริกที่ตรงกับคำค้น`, data };
  }),
});

const describe_entity = tool({
  description: "Look up one master-data record by name or id: a distributor (agent), SKU, distribution centre, campaign or user. Call it to resolve a name the user mentioned before using it as a filter.",
  inputSchema: describeEntityInputSchema,
  execute: withAudit("describe_entity", async ({ kind, query }: z.infer<typeof describeEntityInputSchema>) => dataPort().describeEntity(kind, query)),
});

const get_alerts = tool({
  description: "Read the anomalies the detection engine raised for this user's scope, newest first, each with a hypothesis and two verify steps. Call it when the user asks what is wrong, what changed, or what needs attention.",
  inputSchema: getAlertsInputSchema,
  execute: withAudit("get_alerts", async ({ status, limit }: z.infer<typeof getAlertsInputSchema>) => {
    const access = currentAccess();
    const found = status === "open" ? openAlertsFor(access) : allAlertsFor(access);
    const shown = found.slice(0, limit ?? DEFAULT_ALERT_LIMIT);
    const rows = shown.map(alertRowOf);
    if (rows.length === 0) return { ok: true as const, summary: NO_ALERTS, rows: [], lessons: [], nextActions: [] };
    const lessons = shown.flatMap((alert) => {
      const lesson = lessonFor(alert);
      return lesson ? [{ alertId: alert.id, lesson }] : [];
    });
    return {
      ok: true as const,
      summary: `มีความผิดปกติที่เปิดอยู่ ${rows.length} รายการในขอบเขตของคุณ`,
      rows,
      lessons,
      nextActions: actionsForAlert(access, found[0] ?? null),
    };
  }),
});

const get_forecast = tool({
  description: "Read the deterministic forecast for a metric and dimension slice over the next weeks, with its confidence band and MAPE. Call it when the user asks what will happen, whether stock lasts, or about a plan for coming weeks.",
  inputSchema: getForecastInputSchema,
  execute: withAudit("get_forecast", async ({ metric, dims, weeks }: z.infer<typeof getForecastInputSchema>) => {
    const access = currentAccess();
    const slice = forecastSlice(forecastsFor(access), metric, dims);
    if (!slice) return { ok: true as const, summary: NO_FORECAST, data: [] };
    if (!slice.ok) return { ok: true as const, summary: `${NO_FORECAST} ต้องระบุ ${slice.missingDims.join(", ")} ด้วย เพราะรวมข้ามกันไม่ได้`, data: [] };
    const points = slice.points.slice(0, weeks).map((point) => ({
      week: periodLabelTh(weekKeyOfIso(point.date)),
      value: Math.round(point.value),
      value_label: formatMetricValue(metric, Math.round(point.value)),
      range_label: `${formatMetricValue(metric, Math.round(point.lo))} – ${formatMetricValue(metric, Math.round(point.hi))}`,
    }));
    const total = points.reduce((sum, point) => sum + point.value, 0);
    const combined = slice.seriesCount > 1 ? ` · รวม ${slice.seriesCount} ชุดพยากรณ์ย่อย` : "";
    const additive = ADDITIVE_FORECAST_METRICS.has(metric);
    const average = points.length > 0 ? Math.round(total / points.length) : 0;
    const totalLine = additive ? ` · รวม ${points.length} สัปดาห์ ${formatMetricValue(metric, total)} · เฉลี่ยสัปดาห์ละ ${formatMetricValue(metric, average)}` : "";
    return {
      ok: true as const,
      summary: `พยากรณ์ ${points.length} สัปดาห์ของ${metricLabel(metric)}${combined}${totalLine} (Holt-Winters · ความคลาดเคลื่อนย้อนหลัง MAPE ${slice.mape}%)`,
      total: additive ? total : null,
      weekly_average: additive ? average : null,
      mape: slice.mape,
      data: points,
    };
  }),
});

const CALENDAR_DEFAULT_DAYS = 60;
const CALENDAR_MAX_ROWS = 20;
const CALENDAR_DAILY_LIMIT = 60;

function beerFor(access: AccessContext): DailyBeer {
  return (metric, from, to) => {
    const result = dataPort().runMetric(
      { metric, dims: ["date"], filters: { business_unit: ["beer"] }, range: { from, to }, grain: "day", compare: "none", limit: CALENDAR_DAILY_LIMIT },
      access,
    );
    if (!result.ok) return null;
    return new Map(result.rows.map((row) => [String(row.date), Number(row.value)]));
  };
}

function impactLabel(impact: EventImpact | null): string {
  if (!impact || impact.sellOutPercent === null) return TH.calendar.noImpact;
  const parts = [TH.calendar.sellOut(impact.sellOutPercent)];
  if (impact.orderEvePercent !== null) parts.push(TH.calendar.orderEve(impact.orderEvePercent));
  parts.push(TH.calendar.basis(impact.reference.nameTh, formatDateTh(impact.reference.from)));
  return parts.join(" · ");
}

function dateSpanLabel(event: CalendarEvent): string {
  return event.from === event.to ? formatDateTh(event.from) : `${formatDateTh(event.from)} – ${formatDateTh(event.to)}`;
}

const get_calendar = tool({
  description: "List no-alcohol-sale days (Buddhist holy days), public holidays and festivals in a date range, each with what the last comparable event did to beer volume in the user's scope, measured from data. Call it when the user asks what is coming up, why sales dipped on a day, or how to plan orders around a holiday. from/to default to today and 60 days ahead.",
  inputSchema: getCalendarInputSchema,
  execute: withAudit("get_calendar", async ({ from, to }: z.infer<typeof getCalendarInputSchema>) => {
    const access = currentAccess();
    const start = from ?? TODAY;
    const end = to ?? addDays(start, CALENDAR_DEFAULT_DAYS);
    const events = calendarEvents(start, end).slice(0, CALENDAR_MAX_ROWS);
    if (events.length === 0) return { ok: true as const, summary: TH.calendar.none(formatDateTh(start), formatDateTh(end)), data: [] };
    const beer = beerFor(access);
    const rows = events.map((event) => ({
      date: event.from,
      date_label: dateSpanLabel(event),
      when_label: TH.calendar.inDays(toDayIndex(event.from) - toDayIndex(TODAY)),
      name: event.nameTh,
      kind: event.kind,
      kind_label: TH.calendar.kind[event.kind],
      impact_label: impactLabel(impactOf(event, beer)),
    }));
    const bans = events.filter((event) => event.kind === "alcohol_ban").length;
    return { ok: true as const, summary: TH.calendar.summary(events.length, formatDateTh(start), formatDateTh(end), bans), data: rows };
  }),
});

const recall_memory = tool({
  description: "Search what the assistant remembers about the current user: interests, vocabulary, responsibilities, preferences. Call it when the user refers to something from an earlier session or asks what you remember.",
  inputSchema: recallMemoryInputSchema,
  execute: withAudit("recall_memory", async ({ query }: z.infer<typeof recallMemoryInputSchema>) => {
    const access = currentAccess();
    const needle = query.toLowerCase().trim();
    const rows = memoryFacts()
      .where((fact) => fact.userId === access.userId)
      .map((fact) => ({ fact, match: needle.length === 0 || fact.value.toLowerCase().includes(needle) ? 1 : similarity(needle, fact.value) }))
      .filter(({ match }) => match >= RECALL_MIN_SIMILARITY)
      .sort((left, right) => right.match - left.match || right.fact.confidence - left.fact.confidence)
      .slice(0, DEFAULT_MEMORY_LIMIT)
      .map(({ fact }) => ({ ...fact, status: memoryStatus(fact) }));
    if (rows.length === 0) return { ok: true as const, summary: NO_MEMORY, data: [] };
    return { ok: true as const, summary: `จำได้ ${rows.length} เรื่องที่เกี่ยวข้อง`, data: rows };
  }),
});

const resolve_owner = tool({
  description: "Find the person accountable for a metric in a region (the RACI table) before handing work over or asking for access. Returns the user id, name, title and the reason they own it.",
  inputSchema: resolveOwnerInputSchema,
  execute: withAudit("resolve_owner", async ({ metric, dims }: z.infer<typeof resolveOwnerInputSchema>) => {
    const region = regionOf(dims);
    const suggestion = suggestOwner(metric, region, currentAccess().userId);
    const target = suggestion ? findUser(suggestion.userId) : null;
    if (!suggestion || !target) return { ok: false as const, error: `ยังไม่มีผู้รับผิดชอบสำหรับ ${metric}` };
    return {
      ok: true as const,
      summary: `ผู้รับผิดชอบคือ ${target.nameTh}`,
      data: {
        userId: target.id,
        nameTh: target.nameTh,
        title: target.title,
        role: target.role,
        region: target.region,
        reason: suggestion.reason,
        openLoad: suggestion.openLoad,
        handledBefore: suggestion.handledBefore,
      },
    };
  }),
});

const create_handoff = tool({
  description: "Hand this question over to the responsible person as a context packet: the ask, the urgency and the queries as evidence (references, re-run under their own scope). The user approves it first. Resolve the owner before calling.",
  inputSchema: createHandoffInputSchema,
  needsApproval: true,
  execute: withAudit("create_handoff", async (input: z.infer<typeof createHandoffInputSchema>) => {
    const access = currentAccess();
    const target = recipient(input.toUserId);
    if (!target.ok) return { ok: false as const, error: target.error };
    const turn = currentTurn();
    const packet = createPacket(
      {
        toUserId: target.user.id,
        title: input.title,
        ask: input.ask,
        urgency: input.urgency,
        evidence: mergeEvidence(input.evidence, turn.queries),
        alertIds: input.alertIds,
        digest: digestOfThread(turn.threadId),
        suggestedActions: suggestedActionsFor(input.ask),
        threadId: turn.threadId,
      },
      findUser(access.userId),
      target.user,
    );
    return {
      ok: true as const,
      summary: `ส่งงานให้ ${target.user.nameTh} แล้ว`,
      data: { packetId: packet.id, toUserId: target.user.id, toNameTh: target.user.nameTh, urgency: packet.urgency, sla: packet.sla, evidenceCount: packet.evidence.length },
    };
  }),
});

const send_email = tool({
  description: "Send an internal email to one colleague, for example to request access to a masked metric. It lands in the demo outbox and notifies the recipient. The user approves it first.",
  inputSchema: sendEmailInputSchema,
  needsApproval: true,
  execute: withAudit("send_email", async ({ toUserId, subject, body }: z.infer<typeof sendEmailInputSchema>) => {
    const access = currentAccess();
    const target = recipient(toUserId);
    if (!target.ok) return { ok: false as const, error: target.error };
    const entry = mailEntry({ kind: "email", fromUserId: access.userId, toUserId: target.user.id, toEmail: target.user.email, subject, body, refId: null });
    notify({ userId: target.user.id, kind: "reply", refId: entry.id, title: `อีเมลใหม่: ${subject}` });
    return { ok: true as const, summary: `ส่งอีเมลถึง ${target.user.nameTh} แล้ว`, data: { outboxId: entry.id, toEmail: target.user.email, subject } };
  }),
});

const pin_widget = tool({
  description: "Pin the answer to the user's dashboard as a widget that re-runs its query on every load. Call it when the user asks to keep or pin a view. The user approves it first.",
  inputSchema: pinWidgetInputSchema,
  needsApproval: true,
  execute: withAudit("pin_widget", async ({ title, kind, query }: z.infer<typeof pinWidgetInputSchema>) => {
    const access = currentAccess();
    const layout = layoutOf(access.userId);
    const widget: WidgetSpec = {
      id: randomUUID(),
      userId: access.userId,
      title,
      kind,
      query,
      pinned: true,
      position: layout.widgets.length,
      source: "user_pin",
      reason: null,
      createdAt: now(),
      version: layout.version + 1,
    };
    layouts().put({ id: access.userId, userId: access.userId, version: layout.version + 1, widgets: [...layout.widgets, widget], updatedAt: now() });
    return { ok: true as const, summary: `ปักการ์ด "${title}" บน Dashboard แล้ว`, data: { widgetId: widget.id, position: widget.position } };
  }),
});

const watch_metric = tool({
  description:
    "Keep watching a metric for the user and notify them when it crosses a line: condition.kind 'below' / 'above' compares each row's value with condition.value (in the metric's unit), 'change' fires when the change against the previous period reaches condition.value percent. Use it when the user says เตือน / แจ้งเมื่อ / คอยดู / ถ้า…ให้บอก. The query is checked every hour under the user's own scope, rolling to the latest data. The user approves it first.",
  inputSchema: watchMetricInputSchema,
  needsApproval: true,
  execute: withAudit("watch_metric", async ({ title, query, condition }: z.infer<typeof watchMetricInputSchema>) => {
    const created = createWatch(currentAccess(), { title, query, condition });
    if (!created.ok) return { ok: false as const, error: created.error };
    return {
      ok: true as const,
      summary: TH.watch.created(title, created.now),
      data: { watchId: created.watch.id, condition: conditionLabel(query, condition), state: created.watch.state, now: created.now },
    };
  }),
});

const run_job = tool({
  description: "Run one batch job of the analytics plane: anomaly detection, forecasting or dashboard composition. IT administrators only; the user approves it first.",
  inputSchema: runJobInputSchema,
  needsApproval: true,
  execute: withAudit("run_job", async ({ job }: z.infer<typeof runJobInputSchema>) => {
    if (job === "anomaly") return { ok: true as const, summary: "รันการตรวจจับความผิดปกติแล้ว", data: runAnomalyJob() };
    if (job === "forecast") return { ok: true as const, summary: "รันการพยากรณ์แล้ว", data: runForecastJob() };
    if (job === "watches") return { ok: true as const, summary: "ตรวจเรื่องที่ผู้ใช้เฝ้าดูแล้ว", data: runWatchJob() };
    if (job === "digest") return { ok: true as const, summary: "ส่งสรุปตอนเช้าแล้ว", data: runDigestJob() };
    return { ok: true as const, summary: "รันงานเบื้องหลังทั้งหมดแล้ว", data: runEngineJobs() };
  }),
});

const TOOLS = {
  query_metric,
  list_metrics,
  describe_entity,
  get_alerts,
  get_forecast,
  get_calendar,
  recall_memory,
  resolve_owner,
  create_handoff,
  send_email,
  pin_widget,
  watch_metric,
  run_job,
} satisfies Record<ToolName, Tool>;

export const toolTiers: Partial<Record<ToolName, ToolTier>> = Object.fromEntries(
  TOOL_SURFACE.map((entry) => [entry.name, entry.tier]),
) as Partial<Record<ToolName, ToolTier>>;

export const copTools: ToolSet = TOOLS;

/** The tool set the handler gets for one role: the surface minus what the policy and the kill switch withhold. */
export function toolsForAccess(access: AccessContext): ToolSet {
  return Object.fromEntries(toolsFor(access).map((name) => [name, TOOLS[name]]));
}

export function toolByName(name: ToolName): Tool {
  return TOOLS[name];
}
