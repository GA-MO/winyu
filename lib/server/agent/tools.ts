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
  getForecastInputSchema,
  listMetricsInputSchema,
  metricQuerySchema,
  pinWidgetInputSchema,
  recallMemoryInputSchema,
  resolveOwnerInputSchema,
  runJobInputSchema,
  sendEmailInputSchema,
  type AccessContext,
  type ContextPacket,
  type Dim,
  type Notification,
  type Region,
  type ToolName,
  type ToolTier,
  type WidgetSpec,
} from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { withAudit } from "@/lib/server/audit";
import { currentAccess } from "@/lib/server/request-context";
import { alerts, forecasts, layoutOf, layouts, memoryFacts, notifications, outbox, packets, type OutboxEntry } from "./collections";
import { dataPort } from "./data-port";

const NO_ALERTS = "ยังไม่มีการแจ้งเตือนในระบบ (เอนจินตรวจจับจะเริ่มทำงานในเฟสถัดไป)";
const NO_FORECAST = "ยังไม่มีพยากรณ์ในระบบ (เอนจินพยากรณ์จะเริ่มทำงานในเฟสถัดไป)";
const NO_MEMORY = "ยังไม่มีข้อมูลที่จำไว้เกี่ยวกับผู้ใช้คนนี้";
const ENGINE_MISSING = "engine not installed yet";
const DEFAULT_ALERT_LIMIT = 10;
const DEFAULT_MEMORY_LIMIT = 8;

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

function notify(notification: Omit<Notification, "id" | "at" | "read">): Notification {
  return notifications().put({ ...notification, id: randomUUID(), at: now(), read: false });
}

const query_metric = tool({
  description:
    "Read one certified metric from the semantic layer. Call it for every number you report: volumes, values, attainment, days of cover, margin, AR, headcount. Group with dims, narrow with filters, use compare for prev_period / prev_year / target.",
  inputSchema: metricQuerySchema,
  execute: withAudit("query_metric", async (input: z.infer<typeof metricQuerySchema>) => dataPort().runMetric(input, currentAccess())),
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
    const scope = access.regions === "all" ? null : access.regions;
    const rows = alerts()
      .where((alert) => (status === "open" ? alert.status === "open" : true))
      .filter((alert) => !scope || !alert.dims.region || scope.includes(alert.dims.region as Region))
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, limit ?? DEFAULT_ALERT_LIMIT);
    if (rows.length === 0) return { ok: true as const, summary: NO_ALERTS, data: [] };
    return { ok: true as const, summary: `มีการแจ้งเตือน ${rows.length} รายการในขอบเขตของคุณ`, data: rows };
  }),
});

const get_forecast = tool({
  description: "Read the deterministic forecast for a metric and dimension slice over the next weeks, with its confidence band and MAPE. Call it when the user asks what will happen, whether stock lasts, or about a plan for coming weeks.",
  inputSchema: getForecastInputSchema,
  execute: withAudit("get_forecast", async ({ metric, dims, weeks }: z.infer<typeof getForecastInputSchema>) => {
    const rows = forecasts().where((forecast) => forecast.metric === metric);
    const match = rows.find((forecast) => Object.entries(dims).every(([dim, value]) => !value || forecast.dims[dim as keyof typeof forecast.dims] === value));
    if (!match) return { ok: true as const, summary: NO_FORECAST, data: [] };
    return { ok: true as const, summary: `พยากรณ์ ${weeks} สัปดาห์ (MAPE ${match.mape}%)`, data: match.points.slice(0, weeks) };
  }),
});

const recall_memory = tool({
  description: "Search what the assistant remembers about the current user: interests, vocabulary, responsibilities, preferences. Call it when the user refers to something from an earlier session or asks what you remember.",
  inputSchema: recallMemoryInputSchema,
  execute: withAudit("recall_memory", async ({ query }: z.infer<typeof recallMemoryInputSchema>) => {
    const access = currentAccess();
    const needle = query.toLowerCase();
    const rows = memoryFacts()
      .where((fact) => fact.userId === access.userId)
      .filter((fact) => fact.value.toLowerCase().includes(needle) || needle.length === 0)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, DEFAULT_MEMORY_LIMIT);
    if (rows.length === 0) return { ok: true as const, summary: NO_MEMORY, data: [] };
    return { ok: true as const, summary: `จำได้ ${rows.length} เรื่องที่เกี่ยวข้อง`, data: rows };
  }),
});

const resolve_owner = tool({
  description: "Find the person accountable for a metric in a region (the RACI table) before handing work over or asking for access. Returns the user id, name, title and the reason they own it.",
  inputSchema: resolveOwnerInputSchema,
  execute: withAudit("resolve_owner", async ({ metric, dims }: z.infer<typeof resolveOwnerInputSchema>) => {
    const region = regionOf(dims);
    const owner = responsibleFor(metric, region);
    if (!owner) return { ok: false as const, error: `ยังไม่มีผู้รับผิดชอบสำหรับ ${metric}` };
    const reason = `${owner.user.nameTh} (${owner.user.title}) รับผิดชอบ ${metric} — ${owner.basis}`;
    return {
      ok: true as const,
      summary: `ผู้รับผิดชอบคือ ${owner.user.nameTh}`,
      data: { userId: owner.userId, nameTh: owner.user.nameTh, title: owner.user.title, role: owner.role, region: owner.user.region, reason },
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
    const sender = findUser(access.userId);
    const at = now();
    const packet: ContextPacket = {
      id: randomUUID(),
      fromUserId: access.userId,
      toUserId: target.user.id,
      title: input.title,
      ask: input.ask,
      urgency: input.urgency,
      sla: null,
      evidence: input.evidence,
      alertIds: input.alertIds,
      conversationDigest: input.ask,
      suggestedActions: [],
      status: "open",
      outcome: null,
      thread: [],
      createdAt: at,
      updatedAt: at,
    };
    packets().put(packet);
    notify({ userId: target.user.id, kind: "handoff", refId: packet.id, title: `งานใหม่จาก ${sender?.nameTh ?? access.userId}: ${packet.title}` });
    mailEntry({
      kind: "handoff",
      fromUserId: access.userId,
      toUserId: target.user.id,
      toEmail: target.user.email,
      subject: `[Cop] ส่งต่องาน: ${packet.title}`,
      body: `${packet.ask}\n\nเปิดในกล่องงาน: /inbox/${packet.id}`,
      refId: packet.id,
    });
    return {
      ok: true as const,
      summary: `ส่งงานให้ ${target.user.nameTh} แล้ว`,
      data: { packetId: packet.id, toUserId: target.user.id, toNameTh: target.user.nameTh, urgency: packet.urgency },
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
    return { ok: true as const, summary: `ปักการ์ด "${title}" บนแดชบอร์ดแล้ว`, data: { widgetId: widget.id, position: widget.position } };
  }),
});

const run_job = tool({
  description: "Run one batch job of the analytics plane: anomaly detection, forecasting or dashboard composition. IT administrators only; the user approves it first.",
  inputSchema: runJobInputSchema,
  needsApproval: true,
  execute: withAudit("run_job", async () => ({ ok: false as const, error: ENGINE_MISSING })),
});

const TOOLS = {
  query_metric,
  list_metrics,
  describe_entity,
  get_alerts,
  get_forecast,
  recall_memory,
  resolve_owner,
  create_handoff,
  send_email,
  pin_widget,
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
