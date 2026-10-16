import { METRIC_IDS, ROLE_IDS, type MetricId, type RoleId } from "@/lib/contracts";
import { connectorFields, fieldLabel, isToolName, toolLabel, toolSurface } from "@/lib/server/tools/registry";
import type { setPermissionInputSchema } from "@/lib/contracts";
import type { z } from "zod";
import { defaultFieldVisibility, defaultMetricVisibility, fieldVisibilityOf, grantsOwnTool, isGrantable, permissionsFor, setFieldVisibility, setMetricVisibility, setRoleTool, widensOwnAccess, type RoleOverride, type Visibility } from "@/lib/access/role-overrides";
import { USERS } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { recordPermissionChange, type PermissionVia } from "@/lib/server/audit";

type PermissionInput = z.infer<typeof setPermissionInputSchema>;

const VISIBILITIES: readonly Visibility[] = ["full", "masked", "none"];

export type PermissionChange = {
  role: RoleId;
  roleLabel: string;
  kind: PermissionInput["kind"];
  key: string;
  label: string;
  before: string;
  after: string;
  affectedUsers: number;
};

type Applied = { ok: true; summary: string; data: PermissionChange } | { ok: false; error: string };

/** One role's level on one metric, tool or field: a visibility, or allow or deny for a tool. */
type Level = { role: RoleId; kind: RoleOverride["kind"]; key: string; value: string };

/** A permission that moved, as the admin reads it; `before` is null on an audit row that never recorded it. */
export type MovedPermission = { role: string; kind: string; key: string; before: string | null; after: string };

function itemLabel(kind: string, key: string): string {
  if (kind === "metric") return isMetric(key) ? metricLabel(key) : key;
  return kind === "tool" ? toolLabel(key) : fieldLabel(key);
}

function levelLabel(kind: string, value: string): string {
  if (kind === "tool") return value === "allow" ? TH.adminAudit.allowed : TH.adminAudit.off;
  return TH.adminAudit.visibility[value as Visibility] ?? value;
}

/** A permission change in one Thai line: the role, the item, and its level before and after. */
export function movedPermissionLabel(moved: MovedPermission): string {
  const role = TH.role[moved.role as RoleId] ?? moved.role;
  return TH.adminAudit.permissionSubject(role, itemLabel(moved.kind, moved.key), moved.before === null ? null : levelLabel(moved.kind, moved.before), levelLabel(moved.kind, moved.after));
}

function levels(): Map<string, Level> {
  const table = new Map<string, Level>();
  const put = (level: Level) => table.set(`${level.role}:${level.kind}:${level.key}`, level);
  for (const role of ROLE_IDS) {
    const { metricAcl, toolAllow } = permissionsFor(role);
    for (const metric of METRIC_IDS) put({ role, kind: "metric", key: metric, value: metricAcl[metric] });
    for (const entry of toolSurface()) put({ role, kind: "tool", key: entry.name, value: toolAllow.includes(entry.name) ? "allow" : "deny" });
    for (const field of connectorFields()) put({ role, kind: "field", key: field.key, value: fieldVisibilityOf(role, field.key) });
  }
  return table;
}

/** Runs a change to role permissions and writes one audit row for every level it moved, whoever made it and from where; a change refused or already in place writes none. */
export function auditedPermissionChange<T>(by: string, via: PermissionVia, change: () => T): T {
  const before = levels();
  const result = change();
  for (const [id, after] of levels()) {
    const was = before.get(id);
    if (!was || was.value === after.value) continue;
    const moved = { role: after.role, kind: after.kind, key: after.key, before: was.value, after: after.value };
    recordPermissionChange({ userId: by, via, ...moved, reason: movedPermissionLabel(moved) });
  }
  return result;
}

function membersOf(role: RoleId): number {
  return USERS.filter((user) => user.role === role).length;
}

function isMetric(key: string): key is MetricId {
  return METRIC_IDS.includes(key as MetricId);
}

function toolWord(allowed: boolean): string {
  return allowed ? TH.admin.permission.allow : TH.admin.permission.deny;
}

function changeMetric(role: RoleId, metric: string, value: PermissionInput["value"], by: string): Applied {
  if (!isMetric(metric)) return { ok: false, error: TH.admin.permission.unknownMetric(metric) };
  if (!VISIBILITIES.includes(value as Visibility)) return { ok: false, error: TH.admin.permission.badMetricValue };
  const before = permissionsFor(role).metricAcl[metric];
  if (widensOwnAccess(role, by, before, value as Visibility, defaultMetricVisibility(role, metric))) return { ok: false, error: TH.admin.permission.ownRole(TH.role[role]) };
  setMetricVisibility(role, metric, value as Visibility, by);
  const data = { role, roleLabel: TH.role[role], kind: "metric" as const, key: metric, label: metricLabel(metric), before: TH.adminAudit.visibility[before], after: TH.adminAudit.visibility[value as Visibility], affectedUsers: membersOf(role) };
  return { ok: true, summary: TH.admin.permission.done(data.roleLabel, data.label, data.before, data.after, data.affectedUsers), data };
}

function changeTool(role: RoleId, tool: string, value: PermissionInput["value"], by: string): Applied {
  if (!isToolName(tool)) return { ok: false, error: TH.admin.permission.unknownTool(tool) };
  if (value !== "allow" && value !== "deny") return { ok: false, error: TH.admin.permission.badToolValue };
  const allowed = value === "allow";
  if (allowed && !isGrantable(role, tool)) return { ok: false, error: TH.admin.overrides.notGrantable };
  if (grantsOwnTool(role, by, tool, allowed)) return { ok: false, error: TH.admin.permission.ownRole(TH.role[role]) };
  const before = permissionsFor(role).toolAllow.includes(tool);
  setRoleTool(role, tool, allowed, by);
  const data = { role, roleLabel: TH.role[role], kind: "tool" as const, key: tool, label: tool, before: toolWord(before), after: toolWord(allowed), affectedUsers: membersOf(role) };
  return { ok: true, summary: TH.admin.permission.done(data.roleLabel, data.label, data.before, data.after, data.affectedUsers), data };
}

function changeField(role: RoleId, key: string, value: PermissionInput["value"], by: string): Applied {
  const field = connectorFields().find((item) => item.key === key);
  if (!field) return { ok: false, error: TH.admin.permission.unknownField(key) };
  if (!VISIBILITIES.includes(value as Visibility)) return { ok: false, error: TH.admin.permission.badMetricValue };
  const before = fieldVisibilityOf(role, key);
  if (widensOwnAccess(role, by, before, value as Visibility, defaultFieldVisibility(role, key))) return { ok: false, error: TH.admin.permission.ownRole(TH.role[role]) };
  setFieldVisibility(role, key, value as Visibility, by);
  const data = { role, roleLabel: TH.role[role], kind: "field" as const, key, label: field.labelTh, before: TH.adminAudit.visibility[before], after: TH.adminAudit.visibility[value as Visibility], affectedUsers: membersOf(role) };
  return { ok: true, summary: TH.admin.permission.done(data.roleLabel, data.label, data.before, data.after, data.affectedUsers), data };
}

/** Applies one admin permission change from chat, validated against the metric catalog, the tool surface and the connector fields. */
export function applyPermissionChange(input: PermissionInput, by: string): Applied {
  return auditedPermissionChange(by, "chat", () => {
    if (input.kind === "metric") return changeMetric(input.role, input.key, input.value, by);
    if (input.kind === "field") return changeField(input.role, input.key, input.value, by);
    return changeTool(input.role, input.key, input.value, by);
  });
}
