import type { MetricId, RoleId, ToolName } from "@/lib/contracts";
import { connectorFields, defaultToolsOf, surfaceEntry, toolSurface } from "@/lib/server/tools/registry";
import { collection } from "@/lib/server/store/json-store";
import { ROLE_POLICIES } from "./policies";

export const ROLE_OVERRIDES_COLLECTION = "role-overrides";

export type Visibility = "full" | "masked" | "none";

export type MetricOverride = { id: string; role: RoleId; kind: "metric"; key: MetricId; visibility: Visibility; by: string; at: string };
export type ToolOverride = { id: string; role: RoleId; kind: "tool"; key: ToolName; allowed: boolean; by: string; at: string };
export type FieldOverride = { id: string; role: RoleId; kind: "field"; key: string; visibility: Visibility; by: string; at: string };
export type RoleOverride = MetricOverride | ToolOverride | FieldOverride;

export type RolePermissions = { metricAcl: Record<MetricId, Visibility>; toolAllow: ToolName[] };

const NEXT_VISIBILITY: Record<Visibility, Visibility> = { full: "masked", masked: "none", none: "full" };

function store() {
  return collection<RoleOverride>(ROLE_OVERRIDES_COLLECTION);
}

function idOf(role: RoleId, kind: RoleOverride["kind"], key: string): string {
  return `${role}:${kind}:${key}`;
}

function now(): string {
  return new Date().toISOString();
}

export function roleOverrides(): RoleOverride[] {
  return store().all();
}

export function overrideFor(role: RoleId, kind: RoleOverride["kind"], key: string): RoleOverride | null {
  return store().get(idOf(role, kind, key));
}

/** Destructive tools stay with the roles the tool surface names; an admin can only take them away. */
export function isGrantable(role: RoleId, tool: ToolName): boolean {
  const entry = surfaceEntry(tool);
  if (!entry) return false;
  if (entry.tier !== "destructive") return true;
  return entry.roles === "all" || entry.roles.includes(role);
}

function defaultToolAllowed(role: RoleId, tool: ToolName): boolean {
  return defaultToolsOf(role).includes(tool);
}

/** What a role may see and call right now: the code policy with the admin's overrides on top. */
export function permissionsFor(role: RoleId): RolePermissions {
  const policy = ROLE_POLICIES[role];
  const metricAcl = { ...policy.metricAcl };
  const tools = new Set<ToolName>(defaultToolsOf(role));
  for (const entry of store().where((item) => item.role === role)) {
    if (entry.kind === "field") continue;
    if (entry.kind === "metric") metricAcl[entry.key] = entry.visibility;
    else if (entry.allowed && isGrantable(role, entry.key)) tools.add(entry.key);
    else tools.delete(entry.key);
  }
  return { metricAcl, toolAllow: toolSurface().map((item) => item.name).filter((name) => tools.has(name)) };
}

/** Sets one role's view of a metric; at the code default, the override is dropped so the page shows it as unchanged. */
export function setMetricVisibility(role: RoleId, metric: MetricId, visibility: Visibility, by: string): Visibility {
  const id = idOf(role, "metric", metric);
  if (visibility === ROLE_POLICIES[role].metricAcl[metric]) store().remove(id);
  else store().put({ id, role, kind: "metric", key: metric, visibility, by, at: now() });
  return visibility;
}

/** Gives a role a tool or takes it away; returns false when the tool cannot be given to that role. */
export function setRoleTool(role: RoleId, tool: ToolName, allowed: boolean, by: string): boolean {
  if (allowed && !isGrantable(role, tool)) return false;
  const id = idOf(role, "tool", tool);
  if (allowed === defaultToolAllowed(role, tool)) store().remove(id);
  else store().put({ id, role, kind: "tool", key: tool, allowed, by, at: now() });
  return true;
}

/** Moves one role's view of a metric to the next level: full → masked → none → full. */
export function cycleMetricVisibility(role: RoleId, metric: MetricId, by: string): Visibility {
  return setMetricVisibility(role, metric, NEXT_VISIBILITY[permissionsFor(role).metricAcl[metric]], by);
}

function defaultFieldVisibility(role: RoleId, key: string): Visibility {
  return connectorFields().find((field) => field.key === key)?.defaultFor(role) ?? "none";
}

/** How a role sees one connector field (`${connector}.${field}`) right now; a field no connector declares is hidden. */
export function fieldVisibilityOf(role: RoleId, key: string): Visibility {
  const entry = overrideFor(role, "field", key);
  return entry?.kind === "field" ? entry.visibility : defaultFieldVisibility(role, key);
}

/** Sets one role's view of a connector field; at the connector's default, the override is dropped. */
export function setFieldVisibility(role: RoleId, key: string, visibility: Visibility, by: string): Visibility {
  const id = idOf(role, "field", key);
  if (visibility === defaultFieldVisibility(role, key)) store().remove(id);
  else store().put({ id, role, kind: "field", key, visibility, by, at: now() });
  return visibility;
}

export function cycleFieldVisibility(role: RoleId, key: string, by: string): Visibility {
  return setFieldVisibility(role, key, NEXT_VISIBILITY[fieldVisibilityOf(role, key)], by);
}

export function toggleRoleTool(role: RoleId, tool: ToolName, by: string): boolean {
  const next = !permissionsFor(role).toolAllow.includes(tool);
  return setRoleTool(role, tool, next, by) ? next : !next;
}

/** The value a role had before this override: the code policy for a metric, the tool's declared roles, the connector's default for a field. */
export function defaultOf(entry: RoleOverride): Visibility | boolean {
  if (entry.kind === "metric") return ROLE_POLICIES[entry.role].metricAcl[entry.key];
  if (entry.kind === "field") return defaultFieldVisibility(entry.role, entry.key);
  return defaultToolAllowed(entry.role, entry.key);
}

/** Drops one override so the role is back on the default for that metric, tool or field. */
export function removeOverride(id: string): boolean {
  return store().remove(id);
}

export function resetOverridesOf(role: RoleId): number {
  const mine = store().where((entry) => entry.role === role);
  for (const entry of mine) store().remove(entry.id);
  return mine.length;
}

export function resetRoleOverrides(): number {
  const all = store().all();
  for (const entry of all) store().remove(entry.id);
  return all.length;
}
