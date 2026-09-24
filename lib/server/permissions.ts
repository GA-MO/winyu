import { METRIC_IDS, type MetricId, type RoleId } from "@/lib/contracts";
import { connectorFields, isToolName } from "@/lib/server/tools/registry";
import type { setPermissionInputSchema } from "@/lib/contracts";
import type { z } from "zod";
import { fieldVisibilityOf, isGrantable, permissionsFor, setFieldVisibility, setMetricVisibility, setRoleTool, type Visibility } from "@/lib/access/role-overrides";
import { USERS } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

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
  setMetricVisibility(role, metric, value as Visibility, by);
  const data = { role, roleLabel: TH.role[role], kind: "metric" as const, key: metric, label: metricLabel(metric), before: TH.admin.acl[before], after: TH.admin.acl[value as Visibility], affectedUsers: membersOf(role) };
  return { ok: true, summary: TH.admin.permission.done(data.roleLabel, data.label, data.before, data.after, data.affectedUsers), data };
}

function changeTool(role: RoleId, tool: string, value: PermissionInput["value"], by: string): Applied {
  if (!isToolName(tool)) return { ok: false, error: TH.admin.permission.unknownTool(tool) };
  if (value !== "allow" && value !== "deny") return { ok: false, error: TH.admin.permission.badToolValue };
  const allowed = value === "allow";
  if (allowed && !isGrantable(role, tool)) return { ok: false, error: TH.admin.overrides.notGrantable };
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
  setFieldVisibility(role, key, value as Visibility, by);
  const data = { role, roleLabel: TH.role[role], kind: "field" as const, key, label: field.labelTh, before: TH.admin.acl[before], after: TH.admin.acl[value as Visibility], affectedUsers: membersOf(role) };
  return { ok: true, summary: TH.admin.permission.done(data.roleLabel, data.label, data.before, data.after, data.affectedUsers), data };
}

/** Applies one admin permission change from chat, validated against the metric catalog, the tool surface and the connector fields. */
export function applyPermissionChange(input: PermissionInput, by: string): Applied {
  if (input.kind === "metric") return changeMetric(input.role, input.key, input.value, by);
  if (input.kind === "field") return changeField(input.role, input.key, input.value, by);
  return changeTool(input.role, input.key, input.value, by);
}
