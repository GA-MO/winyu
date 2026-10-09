import { fence } from "@/lib/harness/fence";
import type { AccessContext } from "@/lib/contracts";
import { fieldVisibilityOf } from "@/lib/access/role-overrides";
import type { ConnectorField, ConnectorOutput, ConnectorRow, ConnectorScope, McpCallResult } from "./types";

export const MAX_CONNECTOR_ROWS = 60;
export const MASKED_VALUE = "***";

type Primitive = string | number | boolean | null;

function textOf(raw: McpCallResult): string {
  const content = "content" in raw && Array.isArray(raw.content) ? raw.content : [];
  return content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function payloadOf(raw: McpCallResult): unknown {
  if ("structuredContent" in raw && raw.structuredContent !== undefined) return raw.structuredContent;
  if ("toolResult" in raw) return raw.toolResult;
  return parsed(textOf(raw));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function itemsOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return payload === "" || payload === undefined ? [] : [{ text: payload }];
  const list = Object.values(payload).find(Array.isArray);
  return list ?? [payload];
}

function primitiveOf(value: unknown): Primitive {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => !isRecord(item) && !Array.isArray(item)).map(String).join(", ");
  return value === undefined ? null : JSON.stringify(value);
}

function flatRow(item: unknown): ConnectorRow {
  if (!isRecord(item)) return { value: primitiveOf(item) };
  const row: ConnectorRow = {};
  for (const [key, value] of Object.entries(item)) {
    if (!isRecord(value)) {
      row[key] = primitiveOf(value);
      continue;
    }
    for (const [inner, innerValue] of Object.entries(value)) row[`${key}_${inner}`] = primitiveOf(innerValue);
  }
  return row;
}

/** The raw result of a server Winyu has no adapter for, as flat rows. */
export function genericOutput(raw: McpCallResult): ConnectorOutput {
  return { rows: itemsOf(payloadOf(raw)).map(flatRow) };
}

export function isRemoteError(raw: McpCallResult): boolean {
  return "isError" in raw && raw.isError === true;
}

/** The server's own words about a failure, fenced as data. */
export function remoteErrorText(raw: McpCallResult): string {
  return fence(textOf(raw)).slice(0, 400);
}

export async function scopedArgs(scope: ConnectorScope, args: Record<string, unknown>, access: AccessContext): Promise<Record<string, unknown>> {
  if ("kind" in scope) return args;
  let current = args;
  for (const rule of scope) if (rule.kind === "inject") current = { ...current, ...(await rule.args(access)) };
  return current;
}

export async function scopedRows(scope: ConnectorScope, rows: ConnectorRow[], access: AccessContext): Promise<ConnectorRow[]> {
  if ("kind" in scope) return rows;
  let current = rows;
  for (const rule of scope) if (rule.kind === "filter") current = await rule.rows(current, access);
  return current;
}

function ownsRow(field: ConnectorField, row: ConnectorRow, self: string | null): boolean {
  return field.ownerField !== null && self !== null && row[field.ownerField] === self;
}

function hide(rows: ConnectorRow[], field: ConnectorField, masked: boolean, self: string | null): ConnectorRow[] {
  const keys = [field.field, `${field.field}_label`];
  return rows.map((row) => {
    if (ownsRow(field, row, self)) return row;
    const next = { ...row };
    for (const key of keys) {
      if (!(key in next)) continue;
      if (masked) next[key] = MASKED_VALUE;
      else delete next[key];
    }
    return next;
  });
}

/** Rows with each sensitive field shown in full, masked or dropped for the caller's role (in full on the caller's own rows when the field says so), and the fields not shown in full somewhere. `self` is the caller's employee id. */
export function maskedRows(rows: ConnectorRow[], fields: readonly ConnectorField[], access: AccessContext, self: string | null = null): { rows: ConnectorRow[]; masked: string[] } {
  let visible = rows;
  const masked: string[] = [];
  for (const field of fields) {
    const visibility = fieldVisibilityOf(access.role, field.key);
    if (visibility === "full" || !rows.some((row) => field.field in row && !ownsRow(field, row, self))) continue;
    visible = hide(visible, field, visibility === "masked", self);
    masked.push(field.field);
  }
  return { rows: visible, masked };
}

function fencedValue(value: unknown): unknown {
  return typeof value === "string" ? fence(value) : value;
}

/** Every string a server sent, fenced so it cannot pose as an instruction. */
export function fencedRows(rows: ConnectorRow[]): ConnectorRow[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, fencedValue(value)])));
}
