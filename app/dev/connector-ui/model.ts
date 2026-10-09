import { ROLE_IDS, type RoleId, type ToolTier } from "@/lib/contracts";

export const UNDECLARED_TIER: ToolTier = "destructive";
export const MAX_DESCRIPTION_CHARS = 1200;
export const CHARS_PER_TOKEN = 3;

export type AuthKind = "signed_identity" | "bearer";

/** Who the caller is, as a value a preset can pin into an argument or match against a row. */
export type IdentityKey = "employee_id" | "department_id";

export type InjectPreset = { kind: "inject_regions"; arg: string } | { kind: "inject_identity"; arg: string; key: IdentityKey };

export type FilterPreset =
  | { kind: "own_rows"; field: string; key: IdentityKey }
  | { kind: "people_line"; field: string }
  | { kind: "region_rows"; field: string }
  | { kind: "brand_rows"; field: string };

export type FilterKind = FilterPreset["kind"];

/** A tool's scope while the admin edits it; the stored config never holds "unset". */
export type ScopeDraft = { kind: "unset" } | { kind: "none"; reason: string } | { kind: "scoped"; filter: FilterPreset; inject: InjectPreset | null };

export type Visibility = "full" | "masked" | "none";

/** A field only some roles see in full; `ownerField` also shows it in full to the person the row is about. */
export type SensitiveDraft = { field: string; byRole: Partial<Record<RoleId, Visibility>>; ownerField: string | null };

export type VerifyDraft =
  | { kind: "unset" }
  | { kind: "echo"; idField: string; compare: string[] }
  | { kind: "read_back"; idField: string; readTool: string; readArg: string; compare: string[] };

export type PinKey = IdentityKey | "call_id";

export type PinPreset = { arg: string; key: PinKey };

export type GuardPreset = { arg: string; readTool: string; field: string };

export type WriteDraft = { pins: PinPreset[]; redact: string[]; guard: GuardPreset | null; verify: VerifyDraft; noIdempotencyAck: boolean };

export type RemoteInput = { name: string; type: string };

export type RemoteHints = { readOnly: boolean | null; destructive: boolean | null; idempotent: boolean | null };

/** One tool as the remote server listed it: untrusted text and a schema snapshot Winyu pins at approval. */
export type DiscoveredTool = { name: string; description: string; inputs: RemoteInput[]; hints: RemoteHints; fields: string[] };

export type TestRecord = {
  hash: string;
  asUser: string;
  received: number;
  kept: number;
  missingField: number;
  fields: string[];
  masked: string[];
  sentArgs: Record<string, unknown> | null;
  auditArgs: Record<string, unknown> | null;
  verified: boolean | null;
  guarded: boolean | null;
};

export type ToolDraft = {
  name: string;
  include: boolean;
  labelTh: string;
  description: string;
  tier: ToolTier;
  roles: RoleId[];
  scope: ScopeDraft;
  sensitive: SensitiveDraft[];
  write: WriteDraft;
  test: TestRecord | null;
};

export type ConnectorDraft = { id: string; labelTh: string; url: string; auth: AuthKind; secretHint: string | null; draftKey: string | null; fixture: boolean };

/** What a connector is, derived from its config and switches rather than stored: nothing reaches the model before "live". */
export type LifecycleState = "draft" | "ready" | "live" | "disabled" | "drifted";

export const LIFECYCLE: readonly LifecycleState[] = ["draft", "ready", "live", "disabled", "drifted"];

export const FILTER_KINDS: readonly FilterKind[] = ["own_rows", "people_line", "region_rows", "brand_rows"];

const FIELD_GUESS: Record<FilterKind, RegExp> = {
  own_rows: /(holder|requester|employee|owner)_?id$/i,
  people_line: /(employee|holder|requester)_?id$/i,
  region_rows: /^region$|_region$/i,
  brand_rows: /^brand$|_brand$/i,
};

const REDACT_GUESS = /reason|purpose|note|comment|message|text/i;
const IDEMPOTENCY_GUESS = /idempotency|request_key|dedupe/i;
const PIN_GUESS = /^(requester|holder|employee)_?id$/i;
const DEPARTMENT_GUESS = /^department_?id$/i;

/** A field the remote rows likely carry for this preset, or the first field when none looks right. */
export function guessField(kind: FilterKind, fields: readonly string[]): string {
  return fields.find((field) => FIELD_GUESS[kind].test(field)) ?? fields[0] ?? "";
}

/** The write defaults a careful admin would pick: personal text redacted, the caller pinned into requester-like arguments, the call id as the idempotency key. */
export function writeDefaultsOf(inputs: readonly RemoteInput[]): WriteDraft {
  const pins: PinPreset[] = [];
  for (const input of inputs) {
    if (PIN_GUESS.test(input.name)) pins.push({ arg: input.name, key: "employee_id" });
    else if (DEPARTMENT_GUESS.test(input.name)) pins.push({ arg: input.name, key: "department_id" });
    else if (IDEMPOTENCY_GUESS.test(input.name)) pins.push({ arg: input.name, key: "call_id" });
  }
  const redact = inputs.filter((input) => input.type.includes("string") && REDACT_GUESS.test(input.name)).map((input) => input.name);
  return { pins, redact, guard: null, verify: { kind: "unset" }, noIdempotencyAck: false };
}

/** A fresh draft for a discovered tool: excluded, undeclared tier (destructive), no roles, no scope. */
export function toolDraftOf(tool: DiscoveredTool): ToolDraft {
  return {
    name: tool.name,
    include: false,
    labelTh: "",
    description: tool.description,
    tier: UNDECLARED_TIER,
    roles: [],
    scope: { kind: "unset" },
    sensitive: [],
    write: writeDefaultsOf(tool.inputs),
    test: null,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableJson(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A fingerprint of everything that changes what a tool does; a test run counts only while it matches. */
export function toolHash(tool: ToolDraft): string {
  const { test: _test, labelTh: _label, include: _include, ...behaviour } = tool;
  const text = stableJson(behaviour);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}

export function isWrite(tool: ToolDraft): boolean {
  return tool.tier !== "read";
}

export type BlockerCode =
  | "no_label"
  | "no_description"
  | "long_description"
  | "no_roles"
  | "no_scope"
  | "no_reason"
  | "no_filter_field"
  | "no_inject_arg"
  | "remote_says_writes"
  | "no_verify"
  | "no_idempotency"
  | "no_write_scope"
  | "guard_tool_closed"
  | "no_test"
  | "stale_test";

export type Blocker = { tool: string; code: BlockerCode };

function scopeBlockers(scope: ScopeDraft): BlockerCode[] {
  if (scope.kind === "unset") return ["no_scope"];
  if (scope.kind === "none") return scope.reason.trim().length < 10 ? ["no_reason"] : [];
  const codes: BlockerCode[] = [];
  if (!scope.filter.field) codes.push("no_filter_field");
  if (scope.inject && !scope.inject.arg) codes.push("no_inject_arg");
  return codes;
}

function writeBlockers(tool: ToolDraft, tools: readonly ToolDraft[]): BlockerCode[] {
  if (!isWrite(tool)) return [];
  const codes: BlockerCode[] = [];
  const pinsCaller = tool.write.pins.some((pin) => pin.key !== "call_id");
  if (!pinsCaller && !tool.write.guard) codes.push("no_write_scope");
  const guardTool = tool.write.guard ? tools.find((item) => item.name === tool.write.guard?.readTool) : undefined;
  if (tool.write.guard && (!guardTool?.include || guardTool.scope.kind !== "scoped")) codes.push("guard_tool_closed");
  if (tool.write.verify.kind === "unset") codes.push("no_verify");
  const pinsCallId = tool.write.pins.some((pin) => pin.key === "call_id");
  if (!pinsCallId && !tool.write.noIdempotencyAck) codes.push("no_idempotency");
  return codes;
}

function testBlockers(tool: ToolDraft): BlockerCode[] {
  if (!tool.test) return ["no_test"];
  return tool.test.hash === toolHash(tool) ? [] : ["stale_test"];
}

/** Everything that stops one tool from going live; the same rules the server enforces again on save. */
export function toolBlockers(tool: ToolDraft, remote: DiscoveredTool | undefined, tools: readonly ToolDraft[] = []): BlockerCode[] {
  const codes: BlockerCode[] = [];
  if (!tool.labelTh.trim()) codes.push("no_label");
  if (!tool.description.trim()) codes.push("no_description");
  if (tool.description.length > MAX_DESCRIPTION_CHARS) codes.push("long_description");
  if (tool.roles.length === 0) codes.push("no_roles");
  if (tool.tier === "read" && (remote?.hints.destructive === true || remote?.hints.readOnly === false)) codes.push("remote_says_writes");
  return [...codes, ...scopeBlockers(tool.scope), ...writeBlockers(tool, tools), ...testBlockers(tool)];
}

export function blockersOf(tools: readonly ToolDraft[], remote: readonly DiscoveredTool[]): Blocker[] {
  return tools
    .filter((tool) => tool.include)
    .flatMap((tool) => toolBlockers(tool, remote.find((item) => item.name === tool.name), tools).map((code) => ({ tool: tool.name, code })));
}

/** The default view of a sensitive field for a role: hidden until the admin widens it. */
export function visibilityOf(sensitive: SensitiveDraft, role: RoleId): Visibility {
  return sensitive.byRole[role] ?? "none";
}

/** Which roles gain which tools, for the review matrix and the eval warning. */
export function rolesTouched(tools: readonly ToolDraft[]): RoleId[] {
  const included = tools.filter((tool) => tool.include);
  return ROLE_IDS.filter((role) => included.some((tool) => tool.roles.includes(role)));
}

/** Rough extra prompt tokens one role pays on every question once these tools are live. */
export function promptTokensFor(role: RoleId, tools: readonly ToolDraft[], remote: readonly DiscoveredTool[]): number {
  const chars = tools
    .filter((tool) => tool.include && tool.roles.includes(role))
    .reduce((sum, tool) => sum + tool.description.length + JSON.stringify(remote.find((item) => item.name === tool.name)?.inputs ?? []).length, 0);
  return Math.round(chars / CHARS_PER_TOKEN);
}

export function lifecycleOf(blockers: readonly Blocker[], enabled: boolean | null, drifted: boolean): LifecycleState {
  if (enabled === null) return blockers.length === 0 ? "ready" : "draft";
  if (drifted) return "drifted";
  return enabled ? "live" : "disabled";
}

const SECRET_HINT_LENGTH = 4;

export function hintOf(secret: string): string {
  return secret.slice(-SECRET_HINT_LENGTH);
}
