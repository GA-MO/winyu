import type { z } from "zod";
import { killedTools } from "@/lib/access/enforce";
import { permissionsFor, roleOverrides, type RoleOverride } from "@/lib/access/role-overrides";
import { METRIC_IDS, adminAuditInputSchema, type AdminAuditTopic, type AuditEntry, type RoleId } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { businessToday } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { auditLog } from "@/lib/server/audit";
import { connectorHealth, offlineSince } from "@/lib/server/connectors/catalog";
import { fencedRows, MAX_CONNECTOR_ROWS } from "@/lib/server/connectors/output";
import type { ConnectorRow } from "@/lib/server/connectors/types";
import { modelSpend, type ModelCallSource } from "@/lib/server/model-ledger";
import { sinceDaysStart, toolActivity } from "@/lib/server/tool-activity";
import { defineTool } from "./define";
import { connectors, fieldLabel, toolLabel, toolSurface } from "./registry";

const DEFAULT_DAYS = 7;
const DAY_MS = 86_400_000;
const MODEL_SOURCES: readonly ModelCallSource[] = ["chat", "background", "eval"];
const POLICY_CODES: ReadonlySet<string> = new Set(["PERMISSION_DENIED", "TOOL_NOT_ALLOWED", "NONE_IN_SCOPE", "SCOPE_TRIMMED", "POLICY_RULE"]);

type AuditInput = z.infer<typeof adminAuditInputSchema>;
type Report = { summary: string; rows: ConnectorRow[] } | { error: string };

function sinceDays(days: number, now = Date.now()): string {
  return new Date(now - days * DAY_MS).toISOString();
}

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

function denials(days: number): Report {
  const denied = entriesSince(days)
    .filter((entry) => entry.decision === "deny")
    .sort((left, right) => right.at.localeCompare(left.at));
  const rows = denied.map((entry) => ({
    at_label: whenLabel(entry.at),
    user_name: nameOf(entry.userId),
    role_label: roleLabelOf(entry.userId),
    tool_label: toolLabel(entry.tool),
    code_label: entry.code ? (TH.admin.auditTab.codes[entry.code] ?? entry.code) : "",
    policy_label: heldByPolicy(entry) ? TH.adminAudit.policyHeld : "",
    reason: entry.reason ?? "",
    args: entry.args ?? "",
  }));
  return { summary: TH.adminAudit.denials(denied.length, days, denied.filter(heldByPolicy).length), rows };
}

function toolUsage(days: number): Report {
  const byTool = [...toolActivity(sinceDaysStart(days))].sort(([, left], [, right]) => right.calls - left.calls);
  const calls = byTool.reduce((sum, [, counts]) => sum + counts.calls, 0);
  const rows = byTool.map(([tool, counts]) => ({ tool_label: toolLabel(tool), calls: counts.calls, denied: counts.denied, masked: counts.masked }));
  return { summary: TH.adminAudit.usage(calls, byTool.length, days), rows };
}

function modelCost(days: number): Report {
  const spend = modelSpend(sinceDays(days));
  const rows = MODEL_SOURCES.map((source) => ({ source_label: TH.adminAudit.sources[source], cost_label: TH.adminAudit.usd(spend.bySource[source]) }));
  return { summary: TH.adminAudit.cost(TH.adminAudit.usd(spend.totalUsd), spend.calls, days), rows };
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
  return { ...shared, key_label: key, value_label: TH.admin.acl[entry.visibility] };
}

function overrides(): Report {
  const changed = roleOverrides().sort((left, right) => right.at.localeCompare(left.at)).map(overrideRow);
  const killed = killedTools().map((tool) => ({ role_label: "", kind_label: TH.adminAudit.kind.killed, key_label: toolLabel(tool), value_label: TH.adminAudit.off, by_name: "", at_label: "" }));
  return { summary: TH.adminAudit.overrides(changed.length, killed.length), rows: [...killed, ...changed] };
}

function roleAccess(role: RoleId | null): Report {
  if (!role) return { error: TH.adminAudit.needsRole };
  const { metricAcl, toolAllow } = permissionsFor(role);
  const killed = new Set(killedTools());
  const usable = toolSurface().filter((entry) => toolAllow.includes(entry.name) && !killed.has(entry.name));
  const metrics = METRIC_IDS.map((metric) => ({ kind_label: TH.adminAudit.kind.metric, key_label: metricLabel(metric), value_label: TH.admin.acl[metricAcl[metric]] }));
  const tools = toolSurface().map((entry) => ({ kind_label: TH.adminAudit.kind.tool, key_label: entry.labelTh, value_label: usable.includes(entry) ? TH.adminAudit.allowed : TH.adminAudit.off }));
  const full = METRIC_IDS.filter((metric) => metricAcl[metric] === "full").length;
  return { summary: TH.adminAudit.roleAccess(TH.role[role], usable.length, full), rows: [...metrics, ...tools] };
}

const TOPICS: Record<AdminAuditTopic, (input: AuditInput) => Report> = {
  denials: ({ days }) => denials(days ?? DEFAULT_DAYS),
  tool_usage: ({ days }) => toolUsage(days ?? DEFAULT_DAYS),
  model_cost: ({ days }) => modelCost(days ?? DEFAULT_DAYS),
  connectors: () => connectorStatus(),
  overrides: () => overrides(),
  role_access: ({ role }) => roleAccess(role),
};

/** What an IT admin asks about Winyu itself, read from the audit, the model ledger, connector health and the role overrides: who did what and was refused, never the question they typed, the arguments shown only as the audit already stored them with personal fields hidden, every value fenced as data. */
export function adminReport(input: AuditInput) {
  const report = TOPICS[input.topic](input);
  if ("error" in report) return { ok: false as const, code: "BAD_QUERY", error: report.error };
  return {
    ok: true as const,
    summary: report.summary,
    rows: fencedRows(report.rows.slice(0, MAX_CONNECTOR_ROWS)),
    provenance: { sourceSystem: TH.adminAudit.source, asOf: businessToday(), masked: [] },
  };
}

export const adminAuditTool = defineTool({
  name: "admin_audit",
  connector: "winyu",
  tier: "read",
  roles: ["it_admin"],
  description:
    "Read Winyu's own audit and usage, for the IT admin. topic: denials (who was refused which tool, when and why), tool_usage (calls per tool with denied and masked counts), model_cost (model spend by chat, background jobs and eval), connectors (each MCP connector reachable or not and since when), overrides (permission changes admins made per role and tools switched off for everyone), role_access (what one role sees and may call now; needs role). days is the window for denials, tool_usage and model_cost (null = 7). Call it for ใครถูกปฏิเสธ / การใช้เครื่องมือ / ค่าโมเดล / connector ไหนล่ม / บทบาทนี้เห็นอะไร / ปิดเครื่องมืออะไรไว้. Report denials as they are: a row whose policy_label is set is the access policy holding as designed, not a fault; never suggest widening or loosening a role's access unless the admin asks whether to change it.",
  input: adminAuditInputSchema,
  execute: async (input: AuditInput) => adminReport(input),
});
