import { ROLE_IDS, type RoleId } from "@/lib/contracts";
import {
  cleanedDescription, declarationOf, draftConfigHash, hintsSayWrites, promptTokens,
  type BlockerCode, type ConnectorView, type ReservedReason, type StoredConnector, type StoredTool, type ToolDraft, type UpstreamTool,
} from "@/lib/connectors/spec";


const UNDECLARED_TIER = "destructive";

/** One tool as the wizard holds it: what the server listed now (null when it is gone), what is stored (null before the first save), and the admin's edits. */
export type WizardTool = { name: string; listed: UpstreamTool | null; stored: StoredTool | null; draft: ToolDraft; include: boolean; fields: string[]; reserved: ReservedReason | null };

export type TestStatus = "untested" | "tested" | "stale";

function draftOfStored(name: string, tool: StoredTool): ToolDraft {
  const scope: ToolDraft["scope"] = tool.scope.kind === "none" ? tool.scope : { kind: "scoped", filter: tool.scope.filters[0], inject: tool.scope.inject[0] ?? null };
  return { name, labelTh: tool.labelTh, description: tool.description, tier: tool.tier, roles: [...tool.roles], scope, sensitive: tool.sensitive };
}

function freshDraft(listed: UpstreamTool): ToolDraft {
  return { name: listed.name, labelTh: "", description: cleanedDescription(listed.description), tier: UNDECLARED_TIER, roles: [], scope: { kind: "unset" }, sensitive: [] };
}

/** Every tool the wizard shows: each one the server lists, then each stored one the server no longer lists. */
export function wizardToolsOf(view: ConnectorView): WizardTool[] {
  const stored = view.connector.tools;
  const listed = (view.upstream?.tools ?? []).map((tool) => {
    const saved = stored[tool.name] ?? null;
    return { name: tool.name, listed: tool, stored: saved, draft: saved ? draftOfStored(tool.name, saved) : freshDraft(tool), include: saved !== null, fields: saved?.fields ?? [], reserved: view.reserved[tool.name] ?? null };
  });
  const gone = Object.entries(stored)
    .filter(([name]) => !listed.some((tool) => tool.name === name))
    .map(([name, tool]) => ({ name, listed: null, stored: tool, draft: draftOfStored(name, tool), include: true, fields: tool.fields, reserved: null }));
  return [...listed, ...gone];
}

/** After a save, the wizard's tools take the stored side from the server and keep the admin's unsaved edits. */
export function refreshedTools(current: readonly WizardTool[], view: ConnectorView): WizardTool[] {
  return wizardToolsOf(view).map((fresh) => {
    const mine = current.find((tool) => tool.name === fresh.name);
    return mine ? { ...fresh, draft: mine.draft, include: mine.include, fields: [...new Set([...mine.fields, ...fresh.fields])] } : fresh;
  });
}

export function writesUpstream(tool: WizardTool): boolean {
  return tool.listed !== null && hintsSayWrites(tool.listed.hints);
}

/** Whether the tool's latest test counts for the config on screen. */
export function testStatusOf(connector: Pick<StoredConnector, "url" | "auth">, tool: WizardTool): TestStatus {
  const test = tool.stored?.test;
  if (!test || test.runs.length === 0) return "untested";
  const hash = tool.listed ? draftConfigHash(connector, tool.draft, tool.listed) : null;
  return hash === test.hash ? "tested" : "stale";
}

/** What stops one included tool from going live, as the wizard shows it before the server checks again. */
export function blockersOfTool(connector: Pick<StoredConnector, "url" | "auth">, tool: WizardTool): BlockerCode[] {
  if (tool.reserved) return [tool.reserved];
  if (!tool.listed) return ["gone_upstream"];
  const parsed = declarationOf(tool.draft, tool.listed.hints);
  const codes: BlockerCode[] = parsed.ok ? [] : [...parsed.codes];
  if (tool.stored && tool.stored.pinned.hash !== tool.listed.hash) codes.push("changed_upstream");
  const status = testStatusOf(connector, tool);
  if (status === "untested") codes.push("no_test");
  if (status === "stale") codes.push("stale_test");
  return codes;
}

/** Which roles gain any of these tools. */
export function rolesTouched(tools: readonly WizardTool[]): RoleId[] {
  return ROLE_IDS.filter((role) => tools.some((tool) => tool.draft.roles.includes(role)));
}

/** Rough extra prompt tokens the role that gains the most pays on every question once these tools are live. */
export function tokensOf(tools: readonly WizardTool[]): number {
  return Math.max(0, ...rolesTouched(tools).map((role) => promptTokens(tools.filter((tool) => tool.draft.roles.includes(role)).map((tool) => ({ description: tool.draft.description, inputSchema: tool.listed?.inputSchema ?? {} })))));
}

export function toggledRole(roles: readonly RoleId[], role: RoleId, on: boolean): RoleId[] {
  return on ? ROLE_IDS.filter((id) => id === role || roles.includes(id)) : roles.filter((id) => id !== role);
}
