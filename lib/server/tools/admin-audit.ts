import type { z } from "zod";
import { killedTools } from "@/lib/access/enforce";
import { permissionsFor, roleOverrides, type RoleOverride, type Visibility } from "@/lib/access/role-overrides";
import { METRIC_IDS, adminAuditInputSchema, type AdminAuditTopic, type AuditEntry, type MetricId, type RoleAccessLevel, type RoleId, type ToolName } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { bangkokDate } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { auditCodeLabel } from "@/lib/i18n/audit-codes";
import { TH } from "@/lib/i18n/th";
import { activeUserIds } from "@/lib/server/adoption";
import { activitiesFrom, actorName, approvalLabel, recipientNames, type Activity } from "@/lib/server/activity";
import { actionEvents } from "@/lib/server/agent/collections";
import { auditLog } from "@/lib/server/audit";
import { connectorHealth, offlineSince } from "@/lib/server/connectors/catalog";
import { fencedRows, MAX_CONNECTOR_ROWS } from "@/lib/server/connectors/output";
import type { ConnectorRow } from "@/lib/server/connectors/types";
import { modelSpend, type ModelCallSource } from "@/lib/server/model-ledger";
import { sinceDaysStart, toolActivity, toolCalls } from "@/lib/server/tool-activity";
import { defineTool } from "./define";
import { connectors, fieldLabel, toolLabel, toolSurface } from "./registry";

const DEFAULT_DAYS = 7;
const MODEL_SOURCES: readonly ModelCallSource[] = ["chat", "background", "eval"];
const POLICY_CODES: ReadonlySet<string> = new Set(["PERMISSION_DENIED", "TOOL_NOT_ALLOWED", "NONE_IN_SCOPE", "SCOPE_TRIMMED", "POLICY_RULE"]);

const EXCEPTION_ORDER: readonly Exclude<Visibility, "full">[] = ["none", "masked"];
const LIMIT_TONE: Record<RoleAccessLevel, "danger" | "warning"> = { none: "danger", masked: "warning", off: "danger" };

type AuditInput = z.infer<typeof adminAuditInputSchema>;
type Headline = { label: string; value: string };
type Folded = { line: string; rows: ConnectorRow[] };
type Report = { summary: string; rows: ConnectorRow[]; headline?: Headline; folded?: Folded } | { error: string };
type Limit = { level: RoleAccessLevel; row: ConnectorRow };
type Use = { questions: number; calls: number };

function whenLabel(iso: string): string {
  return `${formatDateTh(iso)} ${formatTimeTh(iso)}`;
}

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function roleLabelOf(userId: string): string {
  const user = findUser(userId);
  return user ? TH.role[user.role] : "";
}

function entriesSince(days: number): AuditEntry[] {
  const since = sinceDaysStart(days);
  return auditLog().where((entry) => entry.at >= since);
}

function heldByPolicy(entry: AuditEntry): boolean {
  return entry.code !== undefined && POLICY_CODES.has(entry.code);
}

function askedLabel(args: string | undefined): string {
  try {
    const parsed: unknown = JSON.parse(args ?? "");
    const metric = parsed && typeof parsed === "object" && "metric" in parsed ? parsed.metric : null;
    return typeof metric === "string" && METRIC_IDS.includes(metric as MetricId) ? metricLabel(metric as MetricId) : "";
  } catch {
    return "";
  }
}

function denials(days: number): Report {
  const denied = entriesSince(days)
    .filter((entry) => entry.decision === "deny")
    .sort((left, right) => right.at.localeCompare(left.at));
  const rows = denied.map((entry) => ({
    at_label: whenLabel(entry.at),
    user_name: nameOf(entry.userId),
    role_label: roleLabelOf(entry.userId),
    tool_label: toolLabel(entry.tool),
    asked_label: askedLabel(entry.args),
    code_label: entry.code ? auditCodeLabel(entry.code) : "",
    policy_label: heldByPolicy(entry) ? TH.adminAudit.policyHeld : "",
    reason: entry.reason ?? "",
  }));
  return { summary: TH.adminAudit.denials(denied.length, days, denied.filter(heldByPolicy).length), rows };
}

function activityRow(activity: Activity): ConnectorRow {
  return {
    at_label: whenLabel(activity.at),
    user_name: actorName(activity),
    role_label: roleLabelOf(activity.actorId),
    action_label: activity.action,
    subject_label: activity.subject,
    to_names: recipientNames(activity),
    approval_label: approvalLabel(activity),
  };
}

function activity(days: number): Report {
  const steps = activitiesFrom(auditLog().all(), sinceDaysStart(days));
  return { summary: TH.adminAudit.activity(steps.length, days), rows: steps.map(activityRow) };
}

function toolUsage(days: number): Report {
  const byTool = [...toolActivity(sinceDaysStart(days))].sort(([, left], [, right]) => right.calls - left.calls);
  const calls = byTool.reduce((sum, [, counts]) => sum + counts.calls, 0);
  const rows = byTool.map(([tool, counts]) => ({ tool_label: toolLabel(tool), calls: counts.calls, denied: counts.denied, masked: counts.masked }));
  return { summary: TH.adminAudit.usage(calls, byTool.length, days), rows };
}

function userUsage(days: number): Report {
  const since = sinceDaysStart(days);
  const byUser = new Map<string, Use>();
  const tally = (userId: string, field: keyof Use) => {
    const use = byUser.get(userId) ?? { questions: 0, calls: 0 };
    use[field] += 1;
    byUser.set(userId, use);
  };
  for (const userId of activeUserIds(actionEvents().all(), toolCalls(auditLog().all()), since)) byUser.set(userId, { questions: 0, calls: 0 });
  for (const event of actionEvents().where((item) => item.kind === "question" && item.at >= since)) tally(event.userId, "questions");
  for (const entry of toolCalls(auditLog().all(), since)) if ((entry.initiator ?? "person") === "person") tally(entry.userId, "calls");
  const ranked = [...byUser].sort(([, left], [, right]) => right.questions - left.questions || right.calls - left.calls);
  const rows = ranked.map(([userId, use]) => ({ user_name: nameOf(userId), role_label: roleLabelOf(userId), questions: use.questions, calls: use.calls }));
  return { summary: usageSummaryOf(rows, days), rows };
}

type UsageRow = { user_name: string; questions: number; calls: number };

/** Who used Winyu most, by questions asked: one name when one person leads, every name that shares the top when several asked the same, never one picked out of a tie (AI-200). */
export function usageSummaryOf(rows: readonly UsageRow[], days: number): string {
  const [top] = rows;
  if (!top) return TH.adminAudit.people(0, days, null);
  const leaders = rows.filter((row) => row.questions === top.questions);
  if (leaders.length > 1) return TH.adminAudit.peopleTied(rows.length, days, leaders.map((row) => row.user_name), top.questions);
  return TH.adminAudit.people(rows.length, days, { name: top.user_name, questions: top.questions, calls: top.calls });
}

function modelCost(days: number): Report {
  const spend = modelSpend(sinceDaysStart(days));
  const rows = MODEL_SOURCES.map((source) => ({ source_label: TH.adminAudit.sources[source], cost_label: TH.adminAudit.usd(spend.bySource[source]) }));
  const headline = { label: TH.adminAudit.costTotal(days), value: TH.adminAudit.usd(spend.totalUsd) };
  return { summary: TH.adminAudit.cost(TH.adminAudit.usd(spend.totalUsd), spend.calls, days), headline, rows };
}

function connectorStatus(): Report {
  const remote = connectors().filter((connector) => connector.kind === "mcp");
  const rows = remote.map((connector) => {
    const down = offlineSince(connector.id);
    return { connector_label: connector.labelTh, status_label: TH.adminAudit.health[connectorHealth(connector.id)], since_label: down ? whenLabel(down) : "" };
  });
  return { summary: TH.adminAudit.connectors(rows.filter((row) => row.since_label !== "").length, remote.length), rows };
}

function overrideRow(entry: RoleOverride): ConnectorRow {
  const shared = { role_label: TH.role[entry.role], kind_label: TH.adminAudit.kind[entry.kind], by_name: nameOf(entry.by), at_label: whenLabel(entry.at) };
  if (entry.kind === "tool") return { ...shared, key_label: toolLabel(entry.key), value_label: entry.allowed ? TH.adminAudit.allowed : TH.adminAudit.off };
  const key = entry.kind === "metric" ? metricLabel(entry.key) : fieldLabel(entry.key);
  return { ...shared, key_label: key, value_label: TH.adminAudit.visibility[entry.visibility] };
}

function overrides(): Report {
  const changed = roleOverrides().sort((left, right) => right.at.localeCompare(left.at)).map(overrideRow);
  const killed = killedTools().map((tool) => ({ role_label: "", kind_label: TH.adminAudit.kind.killed, key_label: toolLabel(tool), value_label: TH.adminAudit.off, by_name: "", at_label: "" }));
  return { summary: TH.adminAudit.overrides(changed.length, killed.length), rows: [...killed, ...changed] };
}

function roleAccess(role: RoleId | null, level: RoleAccessLevel | null): Report {
  if (!role) return { error: TH.adminAudit.needsRole };
  const { metricAcl, toolAllow } = permissionsFor(role);
  const killed = new Set(killedTools());
  const usable = (name: ToolName) => toolAllow.includes(name) && !killed.has(name);
  const metricRow = (metric: MetricId) => ({ kind_label: TH.adminAudit.kind.metric, key_label: metricLabel(metric), value_label: TH.adminAudit.visibility[metricAcl[metric]] });
  const hiddenMetrics: Limit[] = EXCEPTION_ORDER.flatMap((visibility) => METRIC_IDS.filter((metric) => metricAcl[metric] === visibility).map((metric) => ({ level: visibility, row: { ...metricRow(metric), tone: LIMIT_TONE[visibility] } })));
  const offTools: Limit[] = toolSurface()
    .filter((entry) => !usable(entry.name))
    .map((entry) => ({ level: "off", row: { kind_label: TH.adminAudit.kind.tool, key_label: entry.labelTh, value_label: TH.adminAudit.off, tone: LIMIT_TONE.off } }));
  const fullMetrics = METRIC_IDS.filter((metric) => metricAcl[metric] === "full").map(metricRow);
  const usableTools = toolSurface().filter((entry) => usable(entry.name)).map((entry) => ({ kind_label: TH.adminAudit.kind.tool, key_label: entry.labelTh, value_label: TH.adminAudit.allowed }));
  const limits = [...hiddenMetrics, ...offTools];
  const asked = level ? limits.filter((limit) => limit.level === level) : limits;
  const others = level ? limits.filter((limit) => limit.level !== level) : [];
  const line = TH.adminAudit.roleAccessFolded(fullMetrics.length, usableTools.length);
  return {
    summary: level ? TH.adminAudit.roleAccessAt(TH.role[role], TH.adminAudit.level[level], asked.length) : TH.adminAudit.roleAccess(TH.role[role], asked.length),
    rows: asked.map((limit) => limit.row),
    folded: { line: others.length > 0 ? TH.adminAudit.roleAccessOthers(others.length, line) : line, rows: [...others.map((limit) => limit.row), ...fullMetrics, ...usableTools] },
  };
}

const TOPICS: Record<AdminAuditTopic, (input: AuditInput) => Report> = {
  activity: ({ days }) => activity(days ?? DEFAULT_DAYS),
  denials: ({ days }) => denials(days ?? DEFAULT_DAYS),
  tool_usage: ({ days }) => toolUsage(days ?? DEFAULT_DAYS),
  user_usage: ({ days }) => userUsage(days ?? DEFAULT_DAYS),
  model_cost: ({ days }) => modelCost(days ?? DEFAULT_DAYS),
  connectors: () => connectorStatus(),
  overrides: () => overrides(),
  role_access: ({ role, level }) => roleAccess(role, level ?? null),
};

/** What an IT admin asks about Winyu itself, read from the audit, the model ledger, connector health and the role overrides: who did what, how often and what was refused, named in Thai, never the question they typed nor a tool's raw arguments, every value fenced as data. Winyu's own operations happen on the real calendar, so windows count back from the real date and the report is stamped with it, never with Winyu's business day. */
export function adminReport(input: AuditInput) {
  const report = TOPICS[input.topic](input);
  if ("error" in report) return { ok: false as const, code: "BAD_QUERY", error: report.error };
  const systemToday = bangkokDate(new Date());
  return {
    ok: true as const,
    topic: input.topic,
    summary: `${TH.adminAudit.systemAsOf(formatDateTh(systemToday))} · ${report.summary}`,
    headline: report.headline ?? null,
    rows: fencedRows(report.rows.slice(0, MAX_CONNECTOR_ROWS)),
    folded: report.folded ? { line: report.folded.line, rows: fencedRows(report.folded.rows.slice(0, MAX_CONNECTOR_ROWS)) } : null,
    provenance: { sourceSystem: TH.adminAudit.source, asOf: systemToday, masked: [] },
  };
}

export const adminAuditTool = defineTool({
  name: "admin_audit",
  connector: "winyu",
  tier: "read",
  roles: ["it_admin"],
  description:
    "Read Winyu's own audit and usage, for the IT admin. topic: activity (each send, pass-on, accept, close, permission change (from chat or the Admin console, with the old and new level) and write that acted: who, what, on which matter, to whom, when and whose yes let it act), denials (who was refused which tool, when and why), tool_usage (calls per tool with denied and masked counts), user_usage (who uses Winyu most: questions asked and tool calls per person with their role, most first; never what they typed), model_cost (model spend by chat, background jobs and eval), connectors (each MCP connector reachable or not and since when), overrides (permission changes admins made per role and tools switched off for everyone), role_access (what one role may not see in full or may not call now, the metrics it sees in full and the tools it may call folded apart; needs role; level narrows the rows to one kind when the admin asks for only that: masked = metrics shown with numbers hidden, none = metrics not shown, off = tools switched off, null = all of them). days is the window for activity, denials, tool_usage, user_usage and model_cost (null = 7), counted back from the real calendar date, not from Winyu's business day: Winyu's own operations (cost, usage, audit) happen on the real calendar, and the summary opens with that date; say it as that date when you answer. Call it for ใครส่งงานให้ใคร / ใครรับหรือส่งต่อ / ใครถูกปฏิเสธ / การใช้เครื่องมือ / ใครใช้ Winyu เยอะสุด / ค่าโมเดล / connector ไหนล่ม / บทบาทนี้เห็นอะไร / ปิดเครื่องมืออะไรไว้. When headline is set it is the answer: lead with it (model_cost: the total) and put the rows under it. Every topic is a report: say what is hidden, switched off or refused in neutral terms and stop there. A denial row whose policy_label is set is the access policy holding as designed, not a fault. Never offer or suggest opening, widening or loosening anyone's access (no closing line such as 'หากต้องการเปิดสิทธิ์…'), unless the admin asks whether to change it.",
  input: adminAuditInputSchema,
  execute: async (input: AuditInput) => adminReport(input),
});
