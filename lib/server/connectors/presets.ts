import { ROLE_IDS, type AccessContext } from "@/lib/contracts";
import { peopleViewOf } from "@/lib/access/people-scope";
import { ports } from "@/lib/server/ports";
import { directoryOf } from "@/lib/server/ports/directory";
import type { FilterPreset, IdentityKey, InjectPreset, SensitiveSpec, StoredScope } from "@/lib/connectors/spec";
import type { ConnectorRow, ConnectorScope, ScopeRule, SensitiveField } from "./types";

const VIEWS_IN_LINE = new Set(["team", "hr"]);

/** The caller as values a preset matches or sends: their employee id and department, null for someone not in the directory. */
export type CallerIdentity = Record<IdentityKey, string | null>;

export async function callerIdentity(access: AccessContext): Promise<CallerIdentity> {
  const { employees } = await ports().directory.load();
  const self = employees.find((employee) => employee.userId === access.userId);
  return { employee_id: self?.id ?? null, department_id: self?.departmentId ?? null };
}

function inScopeValue(allowed: readonly string[] | "all", value: unknown): boolean {
  if (allowed === "all") return true;
  return typeof value === "string" && allowed.includes(value);
}

async function peopleInLine(rows: ConnectorRow[], access: AccessContext, field: string): Promise<ConnectorRow[]> {
  const directory = directoryOf(await ports().directory.load());
  return rows.filter((row) => {
    const value = row[field];
    const employee = typeof value === "string" ? directory.byId(value) : null;
    const view = employee ? peopleViewOf(access, employee, directory) : null;
    return view !== null && VIEWS_IN_LINE.has(view);
  });
}

/** One filter preset as the rule the connector pipeline already runs; a row without the field never passes a scoped caller. */
export function filterRuleOf(preset: FilterPreset): ScopeRule {
  switch (preset.kind) {
    case "own_rows":
      return {
        kind: "filter",
        rows: async (rows, access) => {
          const mine = (await callerIdentity(access))[preset.key];
          return mine === null ? [] : rows.filter((row) => row[preset.field] === mine);
        },
      };
    case "people_line":
      return { kind: "filter", rows: (rows, access) => peopleInLine(rows, access, preset.field) };
    case "region_rows":
      return { kind: "filter", rows: (rows, access) => rows.filter((row) => inScopeValue(access.regions, row[preset.field])) };
    case "brand_rows":
      return { kind: "filter", rows: (rows, access) => rows.filter((row) => inScopeValue(access.brands, row[preset.field])) };
  }
}

/** One inject preset as an argument rewrite; it narrows what the server sends and is never the boundary on its own. */
export function injectRuleOf(preset: InjectPreset): ScopeRule {
  if (preset.kind === "inject_regions") return { kind: "inject", args: (access) => ({ [preset.arg]: access.regions === "all" ? null : access.regions.join(",") }) };
  return { kind: "inject", args: async (access) => ({ [preset.arg]: (await callerIdentity(access))[preset.key] }) };
}

/** A stored scope as the `ConnectorScope` that `defineMcpConnector` accepts: every filter, then the injected arguments. */
export function connectorScopeOf(scope: StoredScope): ConnectorScope {
  if (scope.kind === "none") return { kind: "none", reason: scope.reason };
  const [first, ...rest] = scope.filters;
  return [filterRuleOf(first), ...rest.map(filterRuleOf), ...scope.inject.map(injectRuleOf)];
}

/** A stored sensitive field as the connector's own: full and masked for the roles the admin widened, hidden for the rest. */
export function sensitiveFieldOf(spec: SensitiveSpec, labelTh: string): SensitiveField {
  const full = ROLE_IDS.filter((role) => spec.byRole[role] === "full");
  const masked = ROLE_IDS.filter((role) => spec.byRole[role] === "masked");
  return { field: spec.field, labelTh, full, masked, ...(spec.ownerField ? { ownerField: spec.ownerField } : {}) };
}
