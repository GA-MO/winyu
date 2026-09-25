import { jsonSchema, type Tool } from "ai";
import { z } from "zod";
import { fence } from "vexa/server";
import type { AccessContext } from "@/lib/contracts";
import { currentAccess } from "@/lib/server/request-context";
import { isToolAllowed, withAdminSwitches } from "@/lib/access/enforce";
import { TH } from "@/lib/i18n/th";
import { markReachable, remoteTool } from "./catalog";
import { clientFor, dropClient } from "./pool";
import { fencedRows, genericOutput, isRemoteError, maskedRows, MAX_CONNECTOR_ROWS, remoteErrorText, scopedArgs, scopedRows } from "./output";
import type { ConnectorIdentity, ConnectorOutput, ConnectorRow, ConnectorToolBinding, McpCallResult, McpConnectorConfig, McpToolConfig, RemoteCaller, RemoteOutcome } from "./types";

export const CONNECTOR_UNAVAILABLE = "CONNECTOR_UNAVAILABLE";
export const CONNECTOR_FAILED = "CONNECTOR_FAILED";
export const PERMISSION_DENIED = "PERMISSION_DENIED";
export const TOOL_NOT_ALLOWED = "TOOL_NOT_ALLOWED";
export const NONE_IN_SCOPE = "NONE_IN_SCOPE";
export const SCOPE_TRIMMED = "SCOPE_TRIMMED";

const ANY_ARGS = z.looseObject({});

export type ConnectorToolResult =
  | { ok: true; summary: string; rows: ConnectorRow[]; code?: typeof NONE_IN_SCOPE | typeof SCOPE_TRIMMED; provenance: { sourceSystem: string; asOf: string; masked: string[] } }
  | { ok: false; code: typeof CONNECTOR_UNAVAILABLE | typeof CONNECTOR_FAILED | typeof PERMISSION_DENIED | typeof TOOL_NOT_ALLOWED; error: string };

class ConnectorTimeout extends Error {}

/** Settles with the work, or rejects once the connector's time is up. */
export function withinTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ConnectorTimeout()), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function callRemote(connector: McpConnectorConfig, binding: ConnectorToolBinding<McpToolConfig>, args: Record<string, unknown>, access: AccessContext): Promise<McpCallResult | null> {
  const work = clientFor(connector, access).then((client) => client.callTool({ name: binding.remoteName, arguments: args, options: { timeout: connector.timeoutMs } }));
  try {
    const result = await withinTimeout(work, connector.timeoutMs);
    markReachable(connector.id, true);
    return result;
  } catch {
    dropClient(connector, access);
    markReachable(connector.id, false);
    return null;
  }
}

/** How an MCP tool is asked: the pooled client of the person asking, the server's error flag, then the adapter or the generic flattening. */
export function mcpCaller(connector: McpConnectorConfig, binding: ConnectorToolBinding<McpToolConfig>): RemoteCaller {
  return async (args, access): Promise<RemoteOutcome> => {
    const raw = await callRemote(connector, binding, args, access);
    if (!raw) return { ok: false, reason: "unavailable" };
    if (isRemoteError(raw)) return { ok: false, reason: "failed", text: remoteErrorText(raw) };
    return { ok: true, output: binding.config.output ? binding.config.output(raw) : genericOutput(raw) };
  };
}

function argsOf(binding: ConnectorToolBinding, input: unknown): Record<string, unknown> {
  return (binding.config.input ?? ANY_ARGS).parse(input) as Record<string, unknown>;
}

function scopeApplies(binding: ConnectorToolBinding): boolean {
  return !("kind" in binding.config.scope);
}

function summaryOf(binding: ConnectorToolBinding, output: ConnectorOutput, total: number): string {
  const label = binding.config.labelTh;
  if (total === 0 && scopeApplies(binding)) return TH.admin.connectors.noneInScope(label);
  if (total > MAX_CONNECTOR_ROWS) return TH.admin.connectors.rowsCapped(label, MAX_CONNECTOR_ROWS, total);
  if (total < output.rows.length) return TH.admin.connectors.rows(label, total);
  return output.summary ?? TH.admin.connectors.rows(label, total);
}

function scopeCodeOf(binding: ConnectorToolBinding, received: number, kept: number): typeof NONE_IN_SCOPE | typeof SCOPE_TRIMMED | null {
  if (!scopeApplies(binding)) return null;
  if (kept === 0) return NONE_IN_SCOPE;
  return kept < received ? SCOPE_TRIMMED : null;
}

async function shaped(connector: ConnectorIdentity, binding: ConnectorToolBinding, output: ConnectorOutput, access: AccessContext): Promise<ConnectorToolResult> {
  const inScope = await scopedRows(binding.config.scope, output.rows, access);
  if (output.rows.length > 0 && inScope.length === 0) return { ok: false, code: PERMISSION_DENIED, error: TH.admin.connectors.outOfScope(binding.config.labelTh) };
  const { rows, masked } = maskedRows(inScope, binding.fields, access);
  const code = scopeCodeOf(binding, output.rows.length, inScope.length);
  return {
    ok: true,
    summary: summaryOf(binding, output, rows.length),
    ...(code ? { code } : {}),
    rows: fencedRows(rows.slice(0, MAX_CONNECTOR_ROWS)),
    provenance: { sourceSystem: connector.sourceSystemTh, asOf: output.asOf ?? new Date().toISOString(), masked },
  };
}

/** One call to a connector tool as the person asking, whatever the transport: Cop's scope on the way in, the other system as that person, then Cop's scope, masking and fence on the way out. */
export async function callConnectorTool(connector: ConnectorIdentity, binding: ConnectorToolBinding, input: unknown, call: RemoteCaller): Promise<ConnectorToolResult> {
  const access = currentAccess();
  if (!isToolAllowed(withAdminSwitches(access), binding.name)) return { ok: false, code: TOOL_NOT_ALLOWED, error: TH.admin.connectors.notAllowed(binding.config.labelTh) };
  const args = scopedArgs(binding.config.scope, argsOf(binding, input), access);
  const outcome = await call(args, access);
  if (outcome.ok) return shaped(connector, binding, outcome.output, access);
  if (outcome.reason === "unavailable") return { ok: false, code: CONNECTOR_UNAVAILABLE, error: TH.admin.connectors.unavailable(connector.labelTh) };
  return { ok: false, code: CONNECTOR_FAILED, error: `${TH.admin.connectors.failed(connector.labelTh)}: ${outcome.text}` };
}

function descriptionOf(connector: ConnectorIdentity, binding: ConnectorToolBinding): string {
  if (binding.config.description) return binding.config.description;
  const remote = remoteTool(connector.id, binding.remoteName)?.description;
  return remote ? fence(remote) : binding.config.labelTh;
}

function inputSchemaOf(connector: ConnectorIdentity, binding: ConnectorToolBinding) {
  if (binding.config.input) return binding.config.input;
  const remote = remoteTool(connector.id, binding.remoteName)?.inputSchema;
  return remote ? jsonSchema(remote) : ANY_ARGS;
}

/** The AI SDK tool the handler hands the model; description and schema follow what the server last said, unless Cop wrote its own. */
export function executableOf(connector: ConnectorIdentity, binding: ConnectorToolBinding, execute: (input: unknown) => Promise<ConnectorToolResult>): Tool {
  return {
    get description() {
      return descriptionOf(connector, binding);
    },
    get inputSchema() {
      return inputSchemaOf(connector, binding);
    },
    ...(binding.tier === "read" ? {} : { needsApproval: true }),
    execute,
  } as unknown as Tool;
}
