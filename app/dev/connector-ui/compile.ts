import type { AccessContext } from "@/lib/contracts";
import { peopleViewOf } from "@/lib/access/people-scope";
import { ports } from "@/lib/server/ports";
import { directoryOf } from "@/lib/server/ports/directory";
import type { ConnectorRow, ConnectorScope, ScopeRule } from "@/lib/server/connectors/types";
import { MASKED_VALUE, scopedRows } from "@/lib/server/connectors/output";
import { visibilityOf, type FilterPreset, type GuardPreset, type IdentityKey, type InjectPreset, type ScopeDraft, type SensitiveDraft, type VerifyDraft, type WriteDraft } from "./model";

const VIEWS_IN_LINE = new Set(["team", "hr"]);
const REDACTED = "[ข้อความส่วนตัว]";

type Identity = Record<IdentityKey, string | null>;

async function identityOf(access: AccessContext): Promise<Identity> {
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
    const employee = directory.byId(String(row[field]));
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
          const mine = (await identityOf(access))[preset.key];
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

/** One inject preset as an argument rewrite; it narrows what the server sends but is never the boundary on its own. */
export function injectRuleOf(preset: InjectPreset, identity: Identity): ScopeRule {
  if (preset.kind === "inject_regions") return { kind: "inject", args: (access) => ({ [preset.arg]: access.regions === "all" ? null : access.regions.join(",") }) };
  return { kind: "inject", args: () => ({ [preset.arg]: identity[preset.key] }) };
}

/** The draft scope as the `ConnectorScope` that `defineMcpConnector` accepts, or null while it is unset. */
export async function connectorScopeOf(scope: ScopeDraft, access: AccessContext): Promise<ConnectorScope | null> {
  if (scope.kind === "unset") return null;
  if (scope.kind === "none") return { kind: "none", reason: scope.reason };
  const filter = filterRuleOf(scope.filter);
  if (!scope.inject) return [filter];
  return [injectRuleOf(scope.inject, await identityOf(access)), filter];
}

function ownsRow(field: SensitiveDraft, row: ConnectorRow, employeeId: string | null): boolean {
  return field.ownerField !== null && employeeId !== null && row[field.ownerField] === employeeId;
}

/** Rows with each sensitive field shown, masked or dropped for this role (in full on the caller's own rows when the field says so), and the fields not shown in full somewhere. */
export async function maskedFor(rows: ConnectorRow[], sensitive: readonly SensitiveDraft[], access: AccessContext): Promise<{ rows: ConnectorRow[]; masked: string[] }> {
  const self = (await identityOf(access)).employee_id;
  const masked: string[] = [];
  let visible = rows;
  for (const field of sensitive) {
    const visibility = visibilityOf(field, access.role);
    if (visibility === "full") continue;
    if (visible.some((row) => field.field in row && !ownsRow(field, row, self))) masked.push(field.field);
    visible = visible.map((row) => {
      if (!(field.field in row) || ownsRow(field, row, self)) return row;
      const next = { ...row };
      if (visibility === "masked") next[field.field] = MASKED_VALUE;
      else delete next[field.field];
      return next;
    });
  }
  return { rows: visible, masked };
}

/** The arguments a write really sends: the model's, with every pinned argument overwritten by the caller's own value or the call id. */
export async function pinnedArgs(args: Record<string, unknown>, write: WriteDraft, access: AccessContext, callId: string): Promise<Record<string, unknown>> {
  const identity = await identityOf(access);
  const pinned = Object.fromEntries(write.pins.map((pin) => [pin.arg, pin.key === "call_id" ? callId : identity[pin.key]]));
  return { ...args, ...pinned };
}

/** The arguments as the audit keeps them: personal text replaced. */
export function auditedArgs(args: Record<string, unknown>, redact: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, redact.includes(key) && value !== null ? REDACTED : value]));
}

/** Whether a write's guarded argument names a row the caller can see through the guard's read tool, under that tool's own scope; checked before anything is sent. */
export async function guardHolds(guard: GuardPreset, sent: Record<string, unknown>, readScope: ConnectorScope, readRows: ConnectorRow[], access: AccessContext): Promise<boolean> {
  const visible = await scopedRows(readScope, readRows, access);
  return visible.some((row) => row[guard.field] !== undefined && row[guard.field] === sent[guard.arg]);
}

/** Whether the record the server says it wrote holds what was asked: an id, and every compared field equal to the argument sent. */
export function holds(verify: VerifyDraft, sent: Record<string, unknown>, record: ConnectorRow | null): boolean {
  if (verify.kind === "unset" || !record) return false;
  if (record[verify.idField] === undefined || record[verify.idField] === null) return false;
  return verify.compare.every((field) => record[field] === sent[field]);
}
