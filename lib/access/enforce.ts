import { TOOL_SURFACE, type AccessContext, type Dim, type ToolName, type ToolTier, type User } from "@/lib/contracts";
import { collection } from "@/lib/server/store/json-store";
import { accessFor } from "./policies";
import { permissionsFor } from "./role-overrides";

export const KILLED_TOOLS_COLLECTION = "killed-tools";
export const SWITCHES_COLLECTION = "switches";
export const HANDOFF_SWITCH_ID = "handoff";
export const HANDOFF_TOOLS: readonly ToolName[] = ["create_handoff", "send_email"];

export type SwitchEntry = { id: string; enabled: boolean; by: string; at: string };

export type KillSwitchEntry = { id: ToolName; killedBy: string; at: string };

export type ScopePredicates = Partial<Record<Dim, string[]>>;

export type OutOfScope = { dim: Dim; requested: string[]; allowed: string[] };

const SCOPED_DIMS = ["region", "brand"] as const;

export class ToolNotAllowedError extends Error {
  readonly code = "TOOL_NOT_ALLOWED";
  readonly tool: string;
  constructor(tool: string, role: string) {
    super(`เครื่องมือ ${tool} ไม่อยู่ในสิทธิ์ของบทบาท ${role}`);
    this.name = "ToolNotAllowedError";
    this.tool = tool;
  }
}

export function killedTools(): ToolName[] {
  return collection<KillSwitchEntry>(KILLED_TOOLS_COLLECTION)
    .all()
    .map((entry) => entry.id);
}

export function killTool(name: ToolName, killedBy: string): KillSwitchEntry {
  return collection<KillSwitchEntry>(KILLED_TOOLS_COLLECTION).put({ id: name, killedBy, at: new Date().toISOString() });
}

export function reviveTool(name: ToolName): boolean {
  return collection<KillSwitchEntry>(KILLED_TOOLS_COLLECTION).remove(name);
}

export function handoffSwitch(): SwitchEntry | null {
  return collection<SwitchEntry>(SWITCHES_COLLECTION).get(HANDOFF_SWITCH_ID);
}

/** Whether people may send work and mail to each other; on until an admin turns it off. */
export function handoffEnabled(): boolean {
  return handoffSwitch()?.enabled ?? true;
}

export function setHandoffEnabled(enabled: boolean, by: string): SwitchEntry {
  return collection<SwitchEntry>(SWITCHES_COLLECTION).put({ id: HANDOFF_SWITCH_ID, enabled, by, at: new Date().toISOString() });
}

function closedTools(): Set<string> {
  const closed = new Set<string>(killedTools());
  if (!handoffEnabled()) for (const name of HANDOFF_TOOLS) closed.add(name);
  return closed;
}

/** The access context under the admin's role overrides, with every tool switched off taken out, so buttons and tools agree. */
export function withAdminSwitches(access: AccessContext): AccessContext {
  const closed = closedTools();
  const permissions = permissionsFor(access.role);
  return { ...access, metricAcl: permissions.metricAcl, toolAllow: permissions.toolAllow.filter((name) => !closed.has(name)) };
}

/** The access context a user's queries run under right now: the role policy, the admin's overrides and switches. */
export function liveAccessFor(user: User): AccessContext {
  return withAdminSwitches(accessFor(user));
}

/** The tools a user may call: the surface, minus what the role policy withholds, minus the admin kill switches. */
export function toolsFor(access: AccessContext): ToolName[] {
  const killed = closedTools();
  return TOOL_SURFACE.filter((entry) => access.toolAllow.includes(entry.name) && !killed.has(entry.name)).map((entry) => entry.name);
}

export function isToolAllowed(access: AccessContext, name: string): boolean {
  return toolsFor(access).some((allowed) => allowed === name);
}

export function assertToolAllowed(access: AccessContext, name: string): void {
  if (!isToolAllowed(access, name)) throw new ToolNotAllowedError(name, access.role);
}

export function tierOfTool(name: ToolName): ToolTier {
  return TOOL_SURFACE.find((entry) => entry.name === name)?.tier ?? "read";
}

/** The dimension filters every query runs under; a dim missing here is unrestricted for this user. */
export function scopePredicates(access: AccessContext): ScopePredicates {
  const predicates: ScopePredicates = {};
  if (access.regions !== "all") predicates.region = [...access.regions];
  if (access.brands !== "all") predicates.brand = [...access.brands];
  return predicates;
}

export function inScope(access: AccessContext, dim: Dim, value: string): boolean {
  const allowed = scopePredicates(access)[dim];
  return !allowed || allowed.includes(value);
}

/** Filters the caller asked for that its scope does not cover; a non-empty result means PERMISSION_DENIED. */
export function outOfScopeFilters(access: AccessContext, filters: Partial<Record<Dim, string[]>>): OutOfScope[] {
  const predicates = scopePredicates(access);
  const denials: OutOfScope[] = [];
  for (const dim of SCOPED_DIMS) {
    const allowed = predicates[dim];
    const requested = filters[dim];
    if (!allowed || !requested) continue;
    const denied = requested.filter((value) => !allowed.includes(value));
    if (denied.length > 0) denials.push({ dim, requested: denied, allowed });
  }
  return denials;
}

/** Narrows a query's filters to the caller's scope, so an unfiltered question never reads outside it. */
export function applyScope(access: AccessContext, filters: Partial<Record<Dim, string[]>>): Partial<Record<Dim, string[]>> {
  const predicates = scopePredicates(access);
  const scoped: Partial<Record<Dim, string[]>> = { ...filters };
  for (const dim of SCOPED_DIMS) {
    const allowed = predicates[dim];
    if (!allowed) continue;
    const requested = scoped[dim];
    scoped[dim] = requested ? requested.filter((value) => allowed.includes(value)) : [...allowed];
  }
  return scoped;
}
