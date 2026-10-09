import { NATIVE_CONNECTORS, ROLE_IDS, type AccessContext, type RoleId, type User } from "@/lib/contracts";
import { connectorEnabled, liveAccessFor, setConnectorEnabled } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { EVAL_CASES } from "@/lib/eval/cases";
import { TH } from "@/lib/i18n/th";
import { recordConnectorEvent, type ConnectorEventKind } from "@/lib/server/audit";
import {
  CONNECTOR_ID, DEFAULT_TIMEOUT_MS, MIN_SECRET_CHARS, declarationOf, inputNamesOf, lifecycleOf, promptTokens, storedConfigHash, storedToolBlockers,
  type ActivateResult, type BlockerCode, type ConnectorView, type DiscoverInput, type EvalImpact, type Problem, type ProblemCode, type SampleResult, type SaveInput, type SaveResult,
  type SensitiveSpec, type StoredConnector, type StoredTool, type TestResult, type TestRun, type ToolSave, type Upstream, type UpstreamTool, type ViewResult,
} from "@/lib/connectors/spec";
import { codeConnectorIds } from "./index";
import { egressAllowlist, egressProblem, EgressRefused } from "./egress";
import { genericOutput, isRemoteError, MASKED_VALUE, scopedArgs, scopedRows } from "./output";
import { callerIdentity, connectorScopeOf } from "./presets";
import { connectorKey, openSecret, sealSecret } from "./secrets";
import { compileStored, listUpstream, liveToolNames, modelInputOf, recordUpstream, saveStored, storedConnector, storedConnectors, upstreamOf, withClient } from "./stored";
import type { ConnectorRow } from "./types";

const MAX_FIELDS = 80;
const DETAIL_CHARS = 160;
const REDACTED_SECRET = "•••";

function isItAdmin(actor: User | null): actor is User {
  return actor?.role === "it_admin";
}

function refuse(problem: ProblemCode, extra: Omit<Problem, "ok" | "problem"> = {}): Problem {
  return { ok: false, problem, ...extra };
}

function audit(actor: User, event: ConnectorEventKind, connector: string, tool: string | null, reason: string, detail: Record<string, unknown> = {}): void {
  recordConnectorEvent({ userId: actor.id, event, connector, tool, reason, detail });
}

function refused(actor: User, connector: string, tool: string | null, problem: ProblemCode): Problem {
  recordConnectorEvent({ userId: actor.id, event: "refused", connector, tool, reason: TH.connectorUi.audit.refused(TH.connectorUi.problems[problem]), detail: {}, code: problem });
  return refuse(problem);
}

function rolesOf(tools: readonly StoredTool[]): RoleId[] {
  return ROLE_IDS.filter((role) => tools.some((tool) => tool.roles.includes(role)));
}

function impactOf(connector: StoredConnector, upstream: Upstream | null): EvalImpact {
  const names = liveToolNames(connector, upstream);
  const tools = names.flatMap((name) => connector.tools[name] ?? []);
  const roles = rolesOf(tools);
  const tokens = Math.max(0, ...roles.map((role) => promptTokens(tools.filter((tool) => tool.roles.includes(role)).map((tool) => ({ description: tool.description, inputSchema: tool.pinned.inputSchema })))));
  const staleRecordings = EVAL_CASES.filter((testCase) => {
    const role = findUser(testCase.userId)?.role;
    return role !== undefined && roles.includes(role);
  }).length;
  return { roles, tools: tools.length, tokens, staleRecordings };
}

/** The admin's view of one console connector, derived fresh from the store, the switch and the last listing. */
export function viewOf(connector: StoredConnector): ConnectorView {
  const upstream = upstreamOf(connector.id);
  const enabled = connectorEnabled(connector.id);
  const blockers = Object.fromEntries(Object.entries(connector.tools).map(([name, tool]) => [name, storedToolBlockers(connector, name, tool, upstream)]));
  const live = connector.activatedAt !== null && enabled ? liveToolNames(connector, upstream) : [];
  return { connector, upstream, state: lifecycleOf(connector, upstream, enabled), enabled, live, blockers, impact: impactOf(connector, upstream) };
}

/** Every console connector as the admin sees it; nothing for anyone else. */
export function connectorViews(actor: User | null): ConnectorView[] {
  return isItAdmin(actor) ? storedConnectors().map(viewOf) : [];
}

/** The console connector with this id as the admin sees it; null for anyone else or an unknown id. */
export function connectorView(actor: User | null, id: string): ConnectorView | null {
  const connector = isItAdmin(actor) ? storedConnector(id) : null;
  return connector ? viewOf(connector) : null;
}

/** What the console shows read-only about the server's own settings: the hosts Winyu may reach and whether secrets can be stored. */
export function serverSettings(actor: User | null): { hosts: string[]; writable: boolean } | null {
  return isItAdmin(actor) ? { hosts: egressAllowlist().entries, writable: connectorKey() !== null } : null;
}

function idProblem(input: DiscoverInput): ProblemCode | null {
  if (!CONNECTOR_ID.test(input.id)) return "bad_id";
  const taken = (NATIVE_CONNECTORS as readonly string[]).includes(input.id) || codeConnectorIds().includes(input.id);
  if (taken || (!input.existing && storedConnector(input.id))) return "id_taken";
  if (input.existing && !storedConnector(input.id)) return "not_found";
  return input.labelTh.trim() ? null : "no_label";
}

function secretFor(input: DiscoverInput, stored: StoredConnector | null): string | null {
  const typed = input.secret.trim();
  if (typed) return typed.length >= MIN_SECRET_CHARS ? typed : null;
  const sameTarget = stored !== null && stored.url === input.url.trim() && stored.auth.kind === input.auth;
  return sameTarget ? openSecret(input.id) : null;
}

function detailOf(error: unknown, secret: string): string {
  const message = error instanceof EgressRefused ? TH.connectorUi.problems[error.problem] : error instanceof Error ? error.message : String(error);
  return message.split(secret).join(REDACTED_SECRET).slice(0, DETAIL_CHARS);
}

function freshConnector(input: DiscoverInput, actor: User, hint: string): StoredConnector {
  const now = new Date().toISOString();
  return {
    id: input.id,
    labelTh: input.labelTh.trim(),
    sourceSystemTh: TH.connectorUi.sourceOf(input.labelTh.trim()),
    url: input.url.trim(),
    auth: { kind: input.auth, secretHint: hint },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    tools: {},
    activatedAt: null,
    createdBy: actor.id,
    createdAt: now,
    updatedBy: actor.id,
    updatedAt: now,
  };
}

/** Connects to a server with the secret the admin typed (or the stored one for the same URL and kind), lists its tools, and keeps the connector and the sealed secret; a new connector starts as a draft with no tools. */
export async function discoverConnector(actor: User | null, input: DiscoverInput): Promise<ViewResult> {
  if (!isItAdmin(actor)) return refuse("not_admin");
  if (!connectorKey()) return refuse("read_only");
  const idIssue = idProblem(input);
  if (idIssue) return refused(actor, input.id || "-", null, idIssue);
  const stored = input.existing ? storedConnector(input.id) : null;
  const secret = secretFor(input, stored);
  if (!secret) return refused(actor, input.id, null, "no_secret");
  const egress = await egressProblem(input.url.trim());
  if (egress) return refused(actor, input.id, null, egress);
  try {
    await listUpstream(input.id, { url: input.url.trim(), auth: input.auth }, secret);
  } catch (error) {
    audit(actor, "refused", input.id, null, TH.connectorUi.audit.refused(TH.connectorUi.problems.unreachable), { url: input.url.trim() });
    return refuse("unreachable", { detail: detailOf(error, secret) });
  }
  const rotated = input.secret.trim() !== "";
  const hint = rotated ? sealSecret(input.id, secret, actor.id)?.hint : stored?.auth.secretHint;
  if (!hint) return refuse("read_only");
  const base = stored ?? freshConnector(input, actor, hint);
  const saved = saveStored({ ...base, labelTh: input.labelTh.trim(), url: input.url.trim(), auth: { kind: input.auth, secretHint: hint }, updatedBy: actor.id, updatedAt: new Date().toISOString() });
  audit(actor, stored ? "rediscovered" : "created", saved.id, null, (stored ? TH.connectorUi.audit.rediscovered : TH.connectorUi.audit.created)(saved.labelTh), { url: saved.url, auth: saved.auth.kind, tools: upstreamOf(saved.id)?.tools.length ?? 0 });
  if (stored && rotated) audit(actor, "secret_rotated", saved.id, null, TH.connectorUi.audit.secret_rotated(hint), { hint });
  return { ok: true, view: viewOf(saved) };
}

type SaveOutcome = { ok: true; tool: StoredTool; approved: boolean } | { ok: false; codes: BlockerCode[] } | { ok: false; problem: ProblemCode };

function savedTool(connector: StoredConnector, listed: UpstreamTool, save: ToolSave, actor: User): SaveOutcome {
  if (save.seenHash !== listed.hash) return { ok: false, problem: "upstream_moved" };
  const parsed = declarationOf(save.draft, listed.hints);
  if (!parsed.ok) return { ok: false, codes: parsed.codes };
  if (!modelInputOf(listed.inputSchema)) return { ok: false, problem: "schema_unsupported" };
  const existing = connector.tools[listed.name];
  const approved = existing !== undefined && existing.pinned.hash !== listed.hash;
  const pinned = { description: listed.description, inputSchema: listed.inputSchema, hints: listed.hints, hash: listed.hash };
  const fields = [...new Set([...(existing?.fields ?? []), ...save.fields])].slice(0, MAX_FIELDS);
  return { ok: true, approved, tool: { ...parsed.declaration, pinned, fields, test: existing?.test ?? null, updatedBy: actor.id, updatedAt: new Date().toISOString() } };
}

function savedDetail(tool: StoredTool): Record<string, unknown> {
  const scope = tool.scope.kind === "none" ? "none" : tool.scope.filters.map((filter) => `${filter.kind}:${filter.field}`).join("+");
  return { roles: tool.roles, scope, sensitive: tool.sensitive.map((spec: SensitiveSpec) => spec.field) };
}

/** Saves every complete tool the admin sent and removes the unticked ones; an incomplete tool is reported, never stored, and any edit voids that tool's test through its config hash. */
export function saveConnectorTools(actor: User | null, input: SaveInput): SaveResult {
  if (!isItAdmin(actor)) return refuse("not_admin");
  if (!connectorKey()) return refuse("read_only");
  const connector = storedConnector(input.connector);
  if (!connector) return refuse("not_found");
  const upstream = upstreamOf(connector.id);
  const tools = { ...connector.tools };
  const incomplete: Record<string, BlockerCode[]> = {};
  for (const save of input.tools) {
    const listed = upstream?.tools.find((tool) => tool.name === save.draft.name);
    if (!listed) return refused(actor, connector.id, save.draft.name, "tool_not_listed");
    const outcome = savedTool(connector, listed, save, actor);
    if (!outcome.ok && "problem" in outcome) return refused(actor, connector.id, save.draft.name, outcome.problem);
    if (!outcome.ok) {
      incomplete[save.draft.name] = outcome.codes;
      continue;
    }
    tools[listed.name] = outcome.tool;
    audit(actor, outcome.approved ? "upstream_approved" : "tool_saved", connector.id, listed.name, (outcome.approved ? TH.connectorUi.audit.upstream_approved : TH.connectorUi.audit.tool_saved)(outcome.tool.labelTh), savedDetail(outcome.tool));
  }
  for (const name of input.removed) {
    if (!(name in tools)) continue;
    delete tools[name];
    audit(actor, "tool_removed", connector.id, name, TH.connectorUi.audit.tool_removed(name));
  }
  const saved = saveStored({ ...connector, tools, updatedBy: actor.id, updatedAt: new Date().toISOString() });
  return { ok: true, view: viewOf(saved), incomplete };
}

function nullArgs(inputSchema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(inputNamesOf(inputSchema).map((name) => [name, null]));
}

function fieldsOf(rows: readonly ConnectorRow[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, MAX_FIELDS);
}

type Caller = { user: User; access: AccessContext };

function callerOf(asUser: string): Caller | null {
  const user = findUser(asUser);
  return user ? { user, access: liveAccessFor(user) } : null;
}

async function rowsAs(connector: StoredConnector, name: string, secret: string, access: AccessContext, args: Record<string, unknown>): Promise<{ rows: ConnectorRow[]; listed: Upstream } | "remote_error"> {
  return withClient({ url: connector.url, auth: connector.auth.kind }, secret, access, async (client) => {
    const listed = recordUpstream(connector.id, await client.listTools());
    const raw = await client.callTool({ name, arguments: args });
    return isRemoteError(raw) ? "remote_error" : { rows: genericOutput(raw).rows, listed };
  });
}

/** Field names a tool's rows carry, read once as the chosen person with every argument empty and no Winyu scope; only the names leave the server. */
export async function sampleToolFields(actor: User | null, input: { connector: string; tool: string; asUser: string }): Promise<SampleResult> {
  if (!isItAdmin(actor)) return refuse("not_admin");
  const connector = storedConnector(input.connector);
  const listed = upstreamOf(input.connector)?.tools.find((tool) => tool.name === input.tool);
  if (!connector || !listed) return refuse("not_found");
  const caller = callerOf(input.asUser);
  if (!caller) return refuse("unknown_user");
  const secret = openSecret(connector.id);
  if (!secret) return refuse("read_only");
  try {
    const outcome = await rowsAs(connector, input.tool, secret, caller.access, nullArgs(listed.inputSchema));
    if (outcome === "remote_error") return refused(actor, connector.id, input.tool, "remote_error");
    const fields = fieldsOf(outcome.rows);
    audit(actor, "sampled", connector.id, input.tool, TH.connectorUi.audit.sampled(input.tool, caller.user.nameTh), { asUser: caller.user.id, fields: fields.length });
    return { ok: true, fields };
  } catch (error) {
    return refuse("unreachable", { detail: detailOf(error, secret) });
  }
}

function hiddenFieldsFor(rows: readonly ConnectorRow[], sensitive: readonly SensitiveSpec[], role: RoleId, self: string | null): string[] {
  return sensitive
    .filter((spec) => (spec.byRole[role] ?? "none") !== "full")
    .filter((spec) => rows.some((row) => spec.field in row && !(spec.ownerField !== null && self !== null && row[spec.ownerField] === self)))
    .map((spec) => (spec.byRole[role] === "masked" ? `${spec.field} ${MASKED_VALUE}` : spec.field));
}

async function testRunOf(connector: StoredConnector, name: string, tool: StoredTool, secret: string, caller: Caller): Promise<TestRun | ProblemCode> {
  const scope = connectorScopeOf(tool.scope);
  const args = await scopedArgs(scope, nullArgs(tool.pinned.inputSchema), caller.access);
  const outcome = await rowsAs(connector, name, secret, caller.access, args);
  if (outcome === "remote_error") return "remote_error";
  if (outcome.listed.tools.find((listed) => listed.name === name)?.hash !== tool.pinned.hash) return "changed_upstream";
  const kept = await scopedRows(scope, outcome.rows, caller.access);
  const filterFields = tool.scope.kind === "scoped" ? tool.scope.filters.map((filter) => filter.field) : [];
  const missingField = outcome.rows.filter((row) => filterFields.some((field) => row[field] === undefined || row[field] === null)).length;
  const self = (await callerIdentity(caller.access)).employee_id;
  return {
    asUser: caller.user.id,
    at: new Date().toISOString(),
    received: outcome.rows.length,
    kept: kept.length,
    missingField,
    fields: fieldsOf(outcome.rows),
    masked: hiddenFieldsFor(kept, tool.sensitive, caller.user.role, self),
  };
}

function withRun(connector: StoredConnector, name: string, tool: StoredTool, run: TestRun): StoredTool {
  const hash = storedConfigHash(connector, name, tool);
  const runs = tool.test?.hash === hash ? [...tool.test.runs.filter((item) => item.asUser !== run.asUser), run] : [run];
  return { ...tool, fields: [...new Set([...tool.fields, ...run.fields])].slice(0, MAX_FIELDS), test: { hash, runs } };
}

/** Runs a saved tool once as the chosen person through its compiled presets and keeps the counts: rows received, rows the scope kept, rows without the filter field, field names, and which fields this role would not see in full. No value leaves the server. */
export async function testConnectorTool(actor: User | null, input: { connector: string; tool: string; asUser: string }): Promise<TestResult> {
  if (!isItAdmin(actor)) return refuse("not_admin");
  if (!connectorKey()) return refuse("read_only");
  const connector = storedConnector(input.connector);
  const tool = connector?.tools[input.tool];
  if (!connector || !tool) return refuse("not_found");
  const caller = callerOf(input.asUser);
  if (!caller) return refuse("unknown_user");
  if (!tool.roles.includes(caller.user.role)) return refused(actor, connector.id, input.tool, "role_not_offered");
  const secret = openSecret(connector.id);
  if (!secret) return refuse("read_only");
  let run: TestRun | ProblemCode;
  try {
    run = await testRunOf(connector, input.tool, tool, secret, caller);
  } catch (error) {
    return refuse("unreachable", { detail: detailOf(error, secret) });
  }
  if (typeof run === "string") return refused(actor, connector.id, input.tool, run);
  const saved = saveStored({ ...connector, tools: { ...connector.tools, [input.tool]: withRun(connector, input.tool, tool, run) } });
  audit(actor, "tested", connector.id, input.tool, TH.connectorUi.audit.tested(tool.labelTh, caller.user.nameTh, run.received, run.kept), { asUser: caller.user.id, received: run.received, kept: run.kept, missingField: run.missingField });
  return { ok: true, view: viewOf(saved), run };
}

function activationBlockers(connector: StoredConnector): BlockerCode[] {
  const upstream = upstreamOf(connector.id);
  return [...new Set(Object.entries(connector.tools).flatMap(([name, tool]) => storedToolBlockers(connector, name, tool, upstream)))];
}

/** Turns a ready connector on: every tool declared, tested at its current config and unchanged upstream, compiled through `defineMcpConnector`; then its switch goes on and its tools reach the roles chosen. */
export function activateConnector(actor: User | null, input: { connector: string }): ActivateResult {
  if (!isItAdmin(actor)) return refuse("not_admin");
  if (!connectorKey()) return refuse("read_only");
  const connector = storedConnector(input.connector);
  if (!connector) return refuse("not_found");
  const blockers = activationBlockers(connector);
  if (Object.keys(connector.tools).length === 0 || blockers.length > 0) {
    audit(actor, "refused", connector.id, null, TH.connectorUi.audit.refused(TH.connectorUi.problems.blocked), { blockers });
    return refuse("blocked", { codes: blockers });
  }
  const secret = openSecret(connector.id);
  if (!secret) return refuse("read_only");
  const activated = { ...connector, activatedAt: new Date().toISOString(), updatedBy: actor.id, updatedAt: new Date().toISOString() };
  try {
    if (!compileStored(activated, secret, upstreamOf(connector.id))) return refuse("blocked");
  } catch (error) {
    audit(actor, "refused", connector.id, null, TH.connectorUi.audit.refused(TH.connectorUi.problems.blocked), { error: error instanceof Error ? error.message.slice(0, DETAIL_CHARS) : "" });
    return refuse("blocked", { detail: error instanceof Error ? error.message.slice(0, DETAIL_CHARS) : undefined });
  }
  const saved = saveStored(activated);
  setConnectorEnabled(saved.id, true, actor.id);
  const view = viewOf(saved);
  audit(actor, "activated", saved.id, null, TH.connectorUi.audit.activated(saved.labelTh, view.impact.roles.length), { tools: view.live, roles: view.impact.roles, staleRecordings: view.impact.staleRecordings });
  return { ok: true, view, impact: view.impact };
}

/** Lists a console connector's tools again now, so a changed or vanished tool leaves the surface without waiting for the probe. */
export async function checkConnectorUpstream(actor: User | null, input: { connector: string }): Promise<ViewResult> {
  if (!isItAdmin(actor)) return refuse("not_admin");
  const connector = storedConnector(input.connector);
  if (!connector) return refuse("not_found");
  const secret = openSecret(connector.id);
  if (!secret) return refuse("read_only");
  try {
    await listUpstream(connector.id, { url: connector.url, auth: connector.auth.kind }, secret);
  } catch (error) {
    return refuse("unreachable", { detail: detailOf(error, secret) });
  }
  const view = viewOf(connector);
  const changed = Object.entries(view.blockers).filter(([, codes]) => codes.includes("changed_upstream") || codes.includes("gone_upstream")).map(([name]) => name);
  audit(actor, "upstream_checked", connector.id, null, TH.connectorUi.audit.upstream_checked(connector.labelTh, changed.length), { changed });
  return { ok: true, view };
}

/** Records the admin turning a console connector's switch on or off, beside the switch itself. */
export function auditConnectorSwitch(actor: User, connector: string, enabled: boolean): void {
  const stored = storedConnector(connector);
  if (!stored) return;
  audit(actor, enabled ? "enabled" : "disabled", connector, null, (enabled ? TH.connectorUi.audit.enabled : TH.connectorUi.audit.disabled)(stored.labelTh));
}
