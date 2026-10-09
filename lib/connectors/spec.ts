import { z } from "zod";
import { ROLE_IDS, type RoleId, type ToolTier } from "@/lib/contracts";
import { INVISIBLE_CHARS } from "@/lib/harness/fence";

export const CONNECTOR_ID = /^[a-z][a-z0-9_]{0,31}$/;
export const REMOTE_TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
export const MAX_DESCRIPTION_CHARS = 1200;
export const MIN_REASON_CHARS = 10;
export const MAX_LABEL_CHARS = 80;
export const CHARS_PER_TOKEN = 3;
export const DEFAULT_TIMEOUT_MS = 4000;
export const SECRET_HINT_CHARS = 4;
export const MIN_SECRET_CHARS = 8;

const MAX_FIELD_CHARS = 64;
const MAX_REASON_CHARS = 300;
const MAX_SENSITIVE = 20;
const MAX_INJECT = 3;
const ROLE_MARKUP = /<\/?\s*(system|assistant|user|tool|instructions?|prompt)\b[^>]*>|\[\s*(system|assistant|instructions?|admin)\s*\]/gi;
const INSTRUCTION_BLOCK = /<\s*(system|assistant|instructions?|prompt)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi;

export type AuthKind = "signed_identity" | "bearer";
export const AUTH_KINDS: readonly AuthKind[] = ["signed_identity", "bearer"];

/** Who the caller is, as a value a preset can match against a row or send as an argument. */
export type IdentityKey = "employee_id" | "department_id";
export const IDENTITY_KEYS: readonly IdentityKey[] = ["employee_id", "department_id"];

export type Visibility = "full" | "masked" | "none";
export const VISIBILITIES: readonly Visibility[] = ["full", "masked", "none"];

const fieldName = z.string().trim().min(1).max(MAX_FIELD_CHARS);
const identityKey = z.enum(IDENTITY_KEYS);
const role = z.enum(ROLE_IDS);

const filterPresetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("own_rows"), field: fieldName, key: identityKey }),
  z.object({ kind: z.literal("people_line"), field: fieldName }),
  z.object({ kind: z.literal("region_rows"), field: fieldName }),
  z.object({ kind: z.literal("brand_rows"), field: fieldName }),
]);

const injectPresetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inject_regions"), arg: fieldName }),
  z.object({ kind: z.literal("inject_identity"), arg: fieldName, key: identityKey }),
]);

/** A row filter: the boundary that decides which rows a caller keeps. */
export type FilterPreset = z.infer<typeof filterPresetSchema>;
export type FilterKind = FilterPreset["kind"];
export const FILTER_KINDS: readonly FilterKind[] = ["own_rows", "people_line", "region_rows", "brand_rows"];

/** An argument Winyu writes before the call; it narrows what the other system sends and is never a boundary on its own. */
export type InjectPreset = z.infer<typeof injectPresetSchema>;

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none"), reason: z.string().trim().min(MIN_REASON_CHARS).max(MAX_REASON_CHARS) }),
  z.object({ kind: z.literal("scoped"), filters: z.tuple([filterPresetSchema], filterPresetSchema), inject: z.array(injectPresetSchema).max(MAX_INJECT) }),
]);

/** A stored tool's scope: no row limit with a reason, or at least one filter with optional injected arguments; an inject-only scope cannot be written down. */
export type StoredScope = z.infer<typeof scopeSchema>;

const sensitiveSchema = z.object({
  field: fieldName,
  byRole: z.partialRecord(role, z.enum(VISIBILITIES)),
  ownerField: fieldName.nullable(),
});

/** A field hidden from every role until the admin widens it per role; `ownerField` shows it in full on the caller's own row. */
export type SensitiveSpec = z.infer<typeof sensitiveSchema>;

const uniqueRoles = (roles: RoleId[]) => ROLE_IDS.filter((id) => roles.includes(id));

/** What the admin declares about one remote tool. Phase 1 opens read tools only, so the tier is always read. */
export const toolDeclarationSchema = z.object({
  labelTh: z.string().trim().min(1).max(MAX_LABEL_CHARS),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_CHARS),
  tier: z.literal("read"),
  roles: z.array(role).min(1).transform(uniqueRoles),
  scope: scopeSchema,
  sensitive: z.array(sensitiveSchema).max(MAX_SENSITIVE).refine((items) => new Set(items.map((item) => item.field)).size === items.length),
});

export type ToolDeclaration = z.infer<typeof toolDeclarationSchema>;

const hintsSchema = z.object({ readOnly: z.boolean().nullable(), destructive: z.boolean().nullable(), idempotent: z.boolean().nullable() });

/** What a server says about its own tool's effects; it can make Winyu stricter, never looser. */
export type RemoteHints = z.infer<typeof hintsSchema>;

const jsonObject = z.record(z.string(), z.unknown());

const pinnedSchema = z.object({ description: z.string(), inputSchema: jsonObject, hints: hintsSchema, hash: z.string().min(1) });

/** The tool as its server listed it when the admin approved it; a different hash later means the server changed it. */
export type PinnedRemote = z.infer<typeof pinnedSchema>;

const testRunSchema = z.object({
  asUser: z.string(),
  at: z.string(),
  received: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
  missingField: z.number().int().nonnegative(),
  fields: z.array(z.string()),
  masked: z.array(z.string()),
});

/** One test call as one person: counts and field names only, never a value. */
export type TestRun = z.infer<typeof testRunSchema>;

const toolTestSchema = z.object({ hash: z.string(), runs: z.array(testRunSchema) });

/** The test runs of one configuration; they count only while `hash` equals the tool's config hash. */
export type ToolTest = z.infer<typeof toolTestSchema>;

const storedToolSchema = z.object({
  ...toolDeclarationSchema.shape,
  pinned: pinnedSchema,
  fields: z.array(z.string()),
  test: toolTestSchema.nullable(),
  updatedBy: z.string(),
  updatedAt: z.string(),
});

export type StoredTool = z.infer<typeof storedToolSchema>;

/** A connector an IT admin added from the console: data that compiles into the same connector `defineMcpConnector` builds. */
export const storedConnectorSchema = z.object({
  id: z.string().regex(CONNECTOR_ID),
  labelTh: z.string().trim().min(1).max(MAX_LABEL_CHARS),
  sourceSystemTh: z.string().trim().min(1).max(MAX_LABEL_CHARS * 2),
  url: z.url(),
  auth: z.object({ kind: z.enum(AUTH_KINDS), secretHint: z.string().max(SECRET_HINT_CHARS) }),
  timeoutMs: z.number().int().positive(),
  tools: z.record(z.string().regex(REMOTE_TOOL_NAME), storedToolSchema),
  activatedAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedBy: z.string(),
  updatedAt: z.string(),
});

export type StoredConnector = z.infer<typeof storedConnectorSchema>;

/** One tool as the server last listed it, with the hash a pinned tool is compared against. */
export type UpstreamTool = { name: string; description: string; inputSchema: Record<string, unknown>; hints: RemoteHints; hash: string };

/** What a connector's server offered the last time Winyu asked: at discovery, a test, the probe or a check. */
export type Upstream = { id: string; at: string; tools: UpstreamTool[] };

/** A tool's scope while the admin edits it; the stored config never holds "unset". */
export type ScopeDraft = { kind: "unset" } | { kind: "none"; reason: string } | { kind: "scoped"; filter: FilterPreset; inject: InjectPreset | null };

/** A tool as the wizard edits it: anything may still be missing. */
export type ToolDraft = { name: string; labelTh: string; description: string; tier: ToolTier; roles: RoleId[]; scope: ScopeDraft; sensitive: SensitiveSpec[] };

const draftText = z.string().max(MAX_DESCRIPTION_CHARS * 2);
const draftFilter = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("own_rows"), field: draftText, key: identityKey }),
  z.object({ kind: z.literal("people_line"), field: draftText }),
  z.object({ kind: z.literal("region_rows"), field: draftText }),
  z.object({ kind: z.literal("brand_rows"), field: draftText }),
]);
const draftInject = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inject_regions"), arg: draftText }),
  z.object({ kind: z.literal("inject_identity"), arg: draftText, key: identityKey }),
]);

/** The shape a wizard draft must have to reach the server's rules at all; what it may still lack is reported by `declarationOf`. */
export const toolDraftSchema: z.ZodType<ToolDraft> = z.object({
  name: z.string().regex(REMOTE_TOOL_NAME),
  labelTh: draftText,
  description: draftText,
  tier: z.enum(["read", "write", "destructive"]),
  roles: z.array(role).max(ROLE_IDS.length),
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unset") }),
    z.object({ kind: z.literal("none"), reason: draftText }),
    z.object({ kind: z.literal("scoped"), filter: draftFilter, inject: draftInject.nullable() }),
  ]),
  sensitive: z.array(z.object({ field: draftText, byRole: z.partialRecord(role, z.enum(VISIBILITIES)), ownerField: draftText.nullable() })).max(MAX_SENSITIVE),
});

export type BlockerCode =
  | "no_label"
  | "no_description"
  | "long_description"
  | "no_roles"
  | "no_scope"
  | "no_reason"
  | "no_filter_field"
  | "no_inject_arg"
  | "write_phase_2"
  | "remote_says_writes"
  | "bad_sensitive"
  | "no_test"
  | "stale_test"
  | "changed_upstream"
  | "gone_upstream"
  | ReservedReason;

/** Why a remote tool may never be opened from the console: it duplicates a native tool, a tool a Winyu port reads from that server, or one a code connector opens there. */
export type ReservedReason = "native_tool" | "port_tool" | "code_tool";
export const RESERVED_REASONS: readonly BlockerCode[] = ["native_tool", "port_tool", "code_tool"];

/** What a connector is, derived from its record, its switch and the last listing, never stored: nothing reaches the model before Live. */
export type LifecycleState = "draft" | "ready" | "live" | "disabled" | "drifted";
export const LIFECYCLE: readonly LifecycleState[] = ["draft", "ready", "live", "disabled", "drifted"];

const FIELD_GUESS: Record<FilterKind, RegExp> = {
  own_rows: /(holder|requester|employee|owner)_?id$/i,
  people_line: /(employee|holder|requester)_?id$/i,
  region_rows: /^region$|_region$/i,
  brand_rows: /^brand$|_brand$/i,
};

/** A field the rows likely carry for this preset, or the first field when none looks right. */
export function guessField(kind: FilterKind, fields: readonly string[]): string {
  return fields.find((field) => FIELD_GUESS[kind].test(field)) ?? fields[0] ?? "";
}

/** Whether the server says the tool changes something, which forbids declaring it read. */
export function hintsSayWrites(hints: RemoteHints): boolean {
  return hints.destructive === true || hints.readOnly === false;
}

function scopeInputOf(scope: ScopeDraft): unknown {
  if (scope.kind !== "scoped") return scope;
  return { kind: "scoped", filters: [scope.filter], inject: scope.inject ? [scope.inject] : [] };
}

function codeOfIssue(issue: z.core.$ZodIssue): BlockerCode {
  const [head, second, , fourth] = issue.path;
  if (head === "labelTh") return "no_label";
  if (head === "description") return issue.code === "too_big" ? "long_description" : "no_description";
  if (head === "tier") return "write_phase_2";
  if (head === "roles") return "no_roles";
  if (head === "sensitive") return "bad_sensitive";
  if (second === "reason") return "no_reason";
  if (second === "filters" && fourth === "field") return "no_filter_field";
  if (second === "inject") return "no_inject_arg";
  return "no_scope";
}

export type DeclarationResult = { ok: true; declaration: ToolDeclaration } | { ok: false; codes: BlockerCode[] };

/** Parses a wizard draft into what may be stored, or the reasons it may not; the client shows them, the server refuses on them. */
export function declarationOf(draft: ToolDraft, hints: RemoteHints): DeclarationResult {
  const parsed = toolDeclarationSchema.safeParse({ ...draft, scope: scopeInputOf(draft.scope) });
  const codes: BlockerCode[] = parsed.success ? [] : [...new Set(parsed.error.issues.map(codeOfIssue))];
  if (draft.tier === "read" && hintsSayWrites(hints)) codes.push("remote_says_writes");
  if (codes.length > 0 || !parsed.success) return { ok: false, codes };
  return { ok: true, declaration: parsed.data };
}

/** JSON with object keys sorted, so equal values always print the same. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, inner]) => inner !== undefined).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableJson(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function cyrb53(text: string): string {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(36);
}

/** What a tool's behaviour depends on; the Thai label and the test runs are left out. */
export type ConfigBasis = { url: string; auth: AuthKind; name: string; declaration: ToolDeclaration; pinnedHash: string };

/** A fingerprint of everything that changes what a tool does; a test counts only while it matches. */
export function configHash(basis: ConfigBasis): string {
  const { labelTh: _label, ...behaviour } = basis.declaration;
  return cyrb53(stableJson({ url: basis.url, auth: basis.auth, name: basis.name, pinned: basis.pinnedHash, behaviour }));
}

/** The hash a draft would carry once saved against the listing the admin sees, for the wizard's tested and stale marks; null while the draft is incomplete. */
export function draftConfigHash(connector: Pick<StoredConnector, "url" | "auth">, draft: ToolDraft, listed: UpstreamTool): string | null {
  const parsed = declarationOf(draft, listed.hints);
  return parsed.ok ? configHash({ url: connector.url, auth: connector.auth.kind, name: draft.name, declaration: parsed.declaration, pinnedHash: listed.hash }) : null;
}

/** The declaration part of a stored tool. */
export function declarationPart(tool: StoredTool): ToolDeclaration {
  return { labelTh: tool.labelTh, description: tool.description, tier: tool.tier, roles: tool.roles, scope: tool.scope, sensitive: tool.sensitive };
}

export function storedConfigHash(connector: Pick<StoredConnector, "url" | "auth">, name: string, tool: StoredTool): string {
  return configHash({ url: connector.url, auth: connector.auth.kind, name, declaration: declarationPart(tool), pinnedHash: tool.pinned.hash });
}

export type UpstreamState = "same" | "changed" | "gone" | "unknown";

/** How the server's last listing compares with what the admin approved. */
export function upstreamStateOf(name: string, tool: StoredTool, upstream: Upstream | null): UpstreamState {
  if (!upstream) return "unknown";
  const listed = upstream.tools.find((item) => item.name === name);
  if (!listed) return "gone";
  return listed.hash === tool.pinned.hash ? "same" : "changed";
}

/** Everything that keeps one stored tool off the model's surface; empty means it may go live. */
export function storedToolBlockers(connector: Pick<StoredConnector, "url" | "auth">, name: string, tool: StoredTool, upstream: Upstream | null): BlockerCode[] {
  const codes: BlockerCode[] = [];
  const state = upstreamStateOf(name, tool, upstream);
  if (state === "changed") codes.push("changed_upstream");
  if (state === "gone") codes.push("gone_upstream");
  if (!tool.test || tool.test.runs.length === 0) codes.push("no_test");
  else if (tool.test.hash !== storedConfigHash(connector, name, tool)) codes.push("stale_test");
  return codes;
}

/** The connector's state from its record, its switch and the last listing. */
export function lifecycleOf(connector: StoredConnector, upstream: Upstream | null, switchedOn: boolean): LifecycleState {
  const blockers = Object.entries(connector.tools).map(([name, tool]) => storedToolBlockers(connector, name, tool, upstream));
  if (connector.activatedAt === null) return blockers.length > 0 && blockers.every((codes) => codes.length === 0) ? "ready" : "draft";
  if (!switchedOn) return "disabled";
  return blockers.some((codes) => codes.includes("changed_upstream") || codes.includes("gone_upstream")) ? "drifted" : "live";
}

/** Rough extra prompt tokens one role pays on every question once these tools are live. */
export function promptTokens(tools: readonly { description: string; inputSchema: Record<string, unknown> }[]): number {
  const chars = tools.reduce((sum, tool) => sum + tool.description.length + JSON.stringify(tool.inputSchema).length, 0);
  return Math.round(chars / CHARS_PER_TOKEN);
}

export function hasSuspiciousText(text: string): boolean {
  return new RegExp(INVISIBLE_CHARS.source).test(text) || new RegExp(ROLE_MARKUP.source, "i").test(text);
}

/** The text Winyu offers as the model-facing description: whole instruction blocks and invisible characters cut, role markup removed. */
export function cleanedDescription(text: string): string {
  return text.replace(INSTRUCTION_BLOCK, "").replace(INVISIBLE_CHARS, "").replace(ROLE_MARKUP, "").replace(/\s{2,}/g, " ").trim().slice(0, MAX_DESCRIPTION_CHARS);
}

export type MarkedPart = { text: string; flagged: boolean };

/** A remote description split into plain text and the parts an admin must see struck out: instruction blocks and invisible characters, the latter spelled as code points. */
export function markedParts(text: string): MarkedPart[] {
  const parts: MarkedPart[] = [];
  const pattern = new RegExp(`${INSTRUCTION_BLOCK.source}|${INVISIBLE_CHARS.source}`, "gi");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), flagged: false });
    const shown = match[0].replace(INVISIBLE_CHARS, (char) => `⟨U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}⟩`);
    parts.push({ text: shown, flagged: true });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), flagged: false });
  return parts;
}

/** The names of a JSON schema's top-level properties. */
export function inputNamesOf(schema: Record<string, unknown>): string[] {
  const properties = schema.properties;
  return typeof properties === "object" && properties !== null ? Object.keys(properties) : [];
}

/** Why Winyu will not connect to a URL. */
export type EgressProblem = "bad_url" | "credentials_in_url" | "host_not_allowed" | "address_refused" | "unresolvable";

export type ProblemCode =
  | "not_admin"
  | "read_only"
  | "bad_id"
  | "id_taken"
  | "no_label"
  | EgressProblem
  | "no_secret"
  | "unreachable"
  | "not_found"
  | "tool_not_listed"
  | "upstream_moved"
  | "declaration"
  | "schema_unsupported"
  | "unknown_user"
  | "role_not_offered"
  | "changed_upstream"
  | "remote_error"
  | "blocked"
  | "bad_input";

/** Why an admin operation did nothing: a code the wizard words in Thai, the blockers when a declaration or activation fell short, and a short technical line when a server failed. */
export type Problem = { ok: false; problem: ProblemCode; codes?: BlockerCode[]; detail?: string };

/** What turning the connector on adds to every question of the roles it reaches, and how many eval recordings of those roles were made without its tools. */
export type EvalImpact = { roles: RoleId[]; tools: number; tokens: number; affectedRecordings: number };

/** A console connector as the admin sees it: the stored record (no secret, only its last characters), the last listing, the derived state and what blocks each tool. */
export type ConnectorView = {
  connector: StoredConnector;
  upstream: Upstream | null;
  state: LifecycleState;
  enabled: boolean;
  live: string[];
  blockers: Record<string, BlockerCode[]>;
  reserved: Record<string, ReservedReason>;
  impact: EvalImpact;
};

export type ViewResult = { ok: true; view: ConnectorView } | Problem;

export type TestResult = { ok: true; view: ConnectorView; run: TestRun } | Problem;

export type SampleResult = { ok: true; fields: string[] } | Problem;

export type ActivateResult = { ok: true; view: ConnectorView; impact: EvalImpact } | Problem;

export type DiscoverInput = { existing: boolean; id: string; labelTh: string; url: string; auth: AuthKind; secret: string };

/** One tool as the wizard sends it to save: the draft, the field names it learned, and the hash of the listing the admin was shown. */
export type ToolSave = { draft: ToolDraft; fields: string[]; seenHash: string };

export type SaveInput = { connector: string; tools: ToolSave[]; removed: string[] };

export type SaveResult = { ok: true; view: ConnectorView; incomplete: Record<string, BlockerCode[]> } | Problem;
