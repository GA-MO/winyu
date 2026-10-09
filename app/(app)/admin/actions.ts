"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { METRIC_IDS, ROLE_IDS, type MetricId, type RoleId, type ToolName } from "@/lib/contracts";
import { connectorFields, connectors, isToolName } from "@/lib/server/tools/registry";
import { killTool, reviveTool, setAlertsInboxEnabled, setConnectorEnabled, setHandoffEnabled } from "@/lib/access/enforce";
import {
  cycleFieldVisibility,
  cycleMetricVisibility,
  removeOverride,
  resetOverridesOf,
  resetRoleOverrides,
  setFieldVisibility,
  setMetricVisibility,
  setRoleTool,
  type Visibility,
} from "@/lib/access/role-overrides";
import { addRule, moveRule, removeRule, setRuleEnabled, updateRule, type RuleCheck } from "@/lib/access/policy-rules";
import { readUser } from "@/lib/server/session";
import { TOKEN_CHANNELS, issueToken, revokeToken, type TokenChannel } from "@/lib/server/access-tokens";
import { TH } from "@/lib/i18n/th";
import {
  AUTH_KINDS, toolDraftSchema,
  type ActivateResult, type DiscoverInput, type Problem, type SampleResult, type SaveInput, type SaveResult, type TestResult, type ViewResult,
} from "@/lib/connectors/spec";
import { activateConnector, auditConnectorSwitch, checkConnectorUpstream, discoverConnector, sampleToolFields, saveConnectorTools, testConnectorTool } from "@/lib/server/connectors/admin";

const ADMIN_PATH = "/admin";
const VISIBILITIES: readonly Visibility[] = ["full", "masked", "none"];

async function adminId(): Promise<string | null> {
  const user = readUser(await cookies());
  return user && user.role === "it_admin" ? user.id : null;
}

function roleIn(formData: FormData): RoleId | null {
  const role = String(formData.get("role"));
  return ROLE_IDS.includes(role as RoleId) ? (role as RoleId) : null;
}

function metricIn(formData: FormData): MetricId | null {
  const metric = String(formData.get("metric"));
  return METRIC_IDS.includes(metric as MetricId) ? (metric as MetricId) : null;
}

function toolIn(formData: FormData): ToolName | null {
  const tool = String(formData.get("tool"));
  return isToolName(tool) ? tool : null;
}

function fieldIn(formData: FormData): string | null {
  const key = String(formData.get("field"));
  return connectorFields().some((field) => field.key === key) ? key : null;
}

function connectorIn(formData: FormData): string | null {
  const id = String(formData.get("connector"));
  return connectors().some((connector) => connector.id === id) ? id : null;
}

export async function setMetricAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const metric = metricIn(formData);
  const visibility = String(formData.get("visibility")) as Visibility;
  if (!by || !role || !metric || !VISIBILITIES.includes(visibility)) return;
  setMetricVisibility(role, metric, visibility, by);
  revalidatePath(ADMIN_PATH);
}

export async function cycleMetricAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const metric = metricIn(formData);
  if (!by || !role || !metric) return;
  cycleMetricVisibility(role, metric, by);
  revalidatePath(ADMIN_PATH);
}

export async function setRoleToolAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const tool = toolIn(formData);
  if (!by || !role || !tool) return;
  setRoleTool(role, tool, String(formData.get("allowed")) === "true", by);
  revalidatePath(ADMIN_PATH);
}

export async function resetRoleAction(formData: FormData) {
  const role = roleIn(formData);
  if (!(await adminId()) || !role) return;
  resetOverridesOf(role);
  revalidatePath(ADMIN_PATH);
}

export async function resetAllAction() {
  if (!(await adminId())) return;
  resetRoleOverrides();
  revalidatePath(ADMIN_PATH);
}

export async function setToolKilledAction(formData: FormData) {
  const by = await adminId();
  const tool = toolIn(formData);
  if (!by || !tool) return;
  if (String(formData.get("killed")) === "true") killTool(tool, by);
  else reviveTool(tool);
  revalidatePath(ADMIN_PATH);
}

export async function setHandoffAction(formData: FormData) {
  const by = await adminId();
  if (!by) return;
  setHandoffEnabled(String(formData.get("enabled")) === "true", by);
  revalidatePath(ADMIN_PATH);
}

export async function setAlertsInboxAction(formData: FormData) {
  const by = await adminId();
  if (!by) return;
  setAlertsInboxEnabled(String(formData.get("enabled")) === "true", by);
  revalidatePath(ADMIN_PATH);
}

export async function setFieldAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const field = fieldIn(formData);
  const visibility = String(formData.get("visibility")) as Visibility;
  if (!by || !role || !field || !VISIBILITIES.includes(visibility)) return;
  setFieldVisibility(role, field, visibility, by);
  revalidatePath(ADMIN_PATH);
}

export async function cycleFieldAction(formData: FormData) {
  const by = await adminId();
  const role = roleIn(formData);
  const field = fieldIn(formData);
  if (!by || !role || !field) return;
  cycleFieldVisibility(role, field, by);
  revalidatePath(ADMIN_PATH);
}

export async function setConnectorAction(formData: FormData) {
  const user = await sessionUser();
  const connector = connectorIn(formData);
  if (user?.role !== "it_admin" || !connector) return;
  const enabled = String(formData.get("enabled")) === "true";
  setConnectorEnabled(connector, enabled, user.id);
  auditConnectorSwitch(user, connector, enabled);
  revalidatePath(ADMIN_PATH);
}

async function sessionUser() {
  return readUser(await cookies());
}

function parsed<T>(schema: z.ZodType<T>, input: unknown): T | null {
  const result = schema.safeParse(input);
  return result.success ? result.data : null;
}

const BAD_INPUT: Problem = { ok: false, problem: "bad_input" };
const connectorRef = z.object({ connector: z.string().max(64) });
const toolRef = connectorRef.extend({ tool: z.string().max(64), asUser: z.string().max(64) });
const discoverInput = z.object({ existing: z.boolean(), id: z.string().max(64), labelTh: z.string().max(200), url: z.string().max(2048), auth: z.enum(AUTH_KINDS), secret: z.string().max(4096) });
const saveInput = connectorRef.extend({
  tools: z.array(z.object({ draft: toolDraftSchema, fields: z.array(z.string().max(64)).max(200), seenHash: z.string().max(128) })).max(50),
  removed: z.array(z.string().max(64)).max(50),
});

/** Connects to a server and lists its tools; the secret stays on the server and the reply carries its last characters only. IT admin only, audited. */
export async function discoverConnectorAction(input: DiscoverInput): Promise<ViewResult> {
  const valid = parsed(discoverInput, input);
  if (!valid) return BAD_INPUT;
  const result = await discoverConnector(await sessionUser(), valid);
  revalidatePath(ADMIN_PATH);
  return result;
}

/** Saves the complete tools of a console connector and removes the unticked ones. IT admin only, audited. */
export async function saveConnectorToolsAction(input: SaveInput): Promise<SaveResult> {
  const valid = parsed(saveInput, input);
  if (!valid) return BAD_INPUT;
  const result = saveConnectorTools(await sessionUser(), valid);
  revalidatePath(ADMIN_PATH);
  return result;
}

/** Reads the field names a tool's rows carry, as the chosen person; no value comes back. IT admin only, audited. */
export async function sampleToolFieldsAction(input: { connector: string; tool: string; asUser: string }): Promise<SampleResult> {
  const valid = parsed(toolRef, input);
  return valid ? sampleToolFields(await sessionUser(), valid) : BAD_INPUT;
}

/** Tests a saved tool as the chosen person: counts and field names only. IT admin only, audited. */
export async function testConnectorToolAction(input: { connector: string; tool: string; asUser: string }): Promise<TestResult> {
  const valid = parsed(toolRef, input);
  if (!valid) return BAD_INPUT;
  const result = await testConnectorTool(await sessionUser(), valid);
  revalidatePath(ADMIN_PATH);
  return result;
}

/** Turns a ready console connector on. IT admin only, audited. */
export async function activateConnectorAction(input: { connector: string }): Promise<ActivateResult> {
  const valid = parsed(connectorRef, input);
  if (!valid) return BAD_INPUT;
  const result = activateConnector(await sessionUser(), valid);
  revalidatePath(ADMIN_PATH);
  return result;
}

/** Lists a console connector's tools again now. IT admin only, audited. */
export async function checkConnectorUpstreamAction(formData: FormData) {
  const valid = parsed(connectorRef, { connector: String(formData.get("connector") ?? "") });
  if (!valid) return;
  await checkConnectorUpstream(await sessionUser(), valid);
  revalidatePath(ADMIN_PATH);
}

export async function removeOverrideAction(formData: FormData) {
  const id = String(formData.get("override"));
  if (!(await adminId()) || !id) return;
  removeOverride(id);
  revalidatePath(ADMIN_PATH);
}

/** What saving a rule came back with: nothing yet, saved, or why the expression was refused. */
export type RuleFormState = RuleCheck | null;

function ruleFieldsOf(formData: FormData): { id: string; name: string; when: string } {
  return { id: String(formData.get("rule") ?? ""), name: String(formData.get("name") ?? ""), when: String(formData.get("when") ?? "") };
}

export async function addRuleAction(_previous: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const by = await adminId();
  if (!by) return null;
  const { name, when } = ruleFieldsOf(formData);
  const check = addRule(name, when, by);
  if (check.ok) revalidatePath(ADMIN_PATH);
  return check;
}

export async function updateRuleAction(_previous: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const by = await adminId();
  if (!by) return null;
  const { id, name, when } = ruleFieldsOf(formData);
  const check = updateRule(id, name, when, by);
  if (check.ok) revalidatePath(ADMIN_PATH);
  return check;
}

export async function setRuleEnabledAction(formData: FormData) {
  const by = await adminId();
  const { id } = ruleFieldsOf(formData);
  if (!by || !id) return;
  setRuleEnabled(id, String(formData.get("enabled")) === "true", by);
  revalidatePath(ADMIN_PATH);
}

export async function moveRuleAction(formData: FormData) {
  const { id } = ruleFieldsOf(formData);
  if (!(await adminId()) || !id) return;
  moveRule(id, String(formData.get("step")) === "up" ? -1 : 1);
  revalidatePath(ADMIN_PATH);
}

export async function removeRuleAction(formData: FormData) {
  const { id } = ruleFieldsOf(formData);
  if (!(await adminId()) || !id) return;
  removeRule(id);
  revalidatePath(ADMIN_PATH);
}

/** What issuing a token came back with: nothing yet, the plain token and its channel to show once, or why it was not issued. */
export type McpTokenFormState = { ok: true; token: string; userId: string; channel: TokenChannel } | { ok: false; error: string } | null;

function channelOf(value: FormDataEntryValue | null): TokenChannel {
  return TOKEN_CHANNELS.find((channel) => channel === value) ?? "mcp";
}

export async function issueMcpTokenAction(_previous: McpTokenFormState, formData: FormData): Promise<McpTokenFormState> {
  const by = await adminId();
  if (!by) return null;
  const channel = channelOf(formData.get("channel"));
  const caller = String(formData.get("caller") ?? "");
  const issued = issueToken(String(formData.get("user") ?? ""), by, channel, caller);
  if (!issued) return { ok: false, error: channel === "a2a" && !caller.trim() ? TH.admin.mcpTab.errors.caller : TH.admin.mcpTab.errors.user };
  revalidatePath(ADMIN_PATH);
  return { ok: true, token: issued.token, userId: issued.record.userId, channel };
}

export async function revokeMcpTokenAction(formData: FormData) {
  const id = String(formData.get("token") ?? "");
  if (!(await adminId()) || !id) return;
  revokeToken(id);
  revalidatePath(ADMIN_PATH);
}
