import { z } from "zod";
import { fence } from "@/lib/harness/fence";
import type { AccessContext } from "@/lib/contracts";
import { currentAccess } from "@/lib/server/request-context";
import { TH } from "@/lib/i18n/th";
import { markReachable, remoteTool } from "./catalog";
import { clientFor, dropClient } from "./pool";
import { fencedRows, genericOutput, isRemoteError, maskedRows, MAX_CONNECTOR_ROWS, remoteErrorText, scopedArgs, scopedRows } from "./output";
import type { ConnectorOutput, ConnectorRow, ConnectorToolBinding, McpCallResult, McpConnectorConfig } from "./types";

export const CONNECTOR_UNAVAILABLE = "CONNECTOR_UNAVAILABLE";
export const CONNECTOR_FAILED = "CONNECTOR_FAILED";
export const PERMISSION_DENIED = "PERMISSION_DENIED";
export const NONE_IN_SCOPE = "NONE_IN_SCOPE";
export const SCOPE_TRIMMED = "SCOPE_TRIMMED";

const ANY_ARGS = z.looseObject({});

export type ConnectorToolResult =
  | { ok: true; summary: string; rows: ConnectorRow[]; code?: typeof NONE_IN_SCOPE | typeof SCOPE_TRIMMED; provenance: { sourceSystem: string; asOf: string; masked: string[] } }
  | { ok: false; code: typeof CONNECTOR_UNAVAILABLE | typeof CONNECTOR_FAILED | typeof PERMISSION_DENIED; error: string };

type RemoteOutcome = { ok: true; output: ConnectorOutput } | { ok: false; reason: "unavailable" } | { ok: false; reason: "failed"; text: string };

class ConnectorTimeout extends Error {}

function withinTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ConnectorTimeout()), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function callRemote(connector: McpConnectorConfig, binding: ConnectorToolBinding, args: Record<string, unknown>, access: AccessContext): Promise<McpCallResult | null> {
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

function outputOf(binding: ConnectorToolBinding, raw: McpCallResult): RemoteOutcome {
  try {
    return { ok: true, output: binding.config.output ? binding.config.output(raw) : genericOutput(raw) };
  } catch {
    return { ok: false, reason: "failed", text: "result is not what the adapter expects" };
  }
}

async function askServer(connector: McpConnectorConfig, binding: ConnectorToolBinding, args: Record<string, unknown>, access: AccessContext): Promise<RemoteOutcome> {
  const raw = await callRemote(connector, binding, args, access);
  if (!raw) return { ok: false, reason: "unavailable" };
  if (isRemoteError(raw)) return { ok: false, reason: "failed", text: remoteErrorText(raw) };
  return outputOf(binding, raw);
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

async function shaped(connector: McpConnectorConfig, binding: ConnectorToolBinding, output: ConnectorOutput, access: AccessContext): Promise<ConnectorToolResult> {
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

/** One call to a connector tool as the person asking, once the gateway allowed it: Winyu's scope on the way in, the MCP server as that person (its error flag, then the adapter or the generic flattening), then Winyu's scope, masking and fence on the way out. */
export async function callConnectorTool(connector: McpConnectorConfig, binding: ConnectorToolBinding, input: unknown): Promise<ConnectorToolResult> {
  const access = currentAccess();
  const args = scopedArgs(binding.config.scope, argsOf(binding, input), access);
  const outcome = await askServer(connector, binding, args, access);
  if (outcome.ok) return shaped(connector, binding, outcome.output, access);
  if (outcome.reason === "unavailable") return { ok: false, code: CONNECTOR_UNAVAILABLE, error: TH.admin.connectors.unavailable(connector.labelTh) };
  return { ok: false, code: CONNECTOR_FAILED, error: `${TH.admin.connectors.failed(connector.labelTh)}: ${outcome.text}` };
}

/** The description the model reads: Winyu's own when written, else the server's last word, fenced. */
export function descriptionOf(connector: McpConnectorConfig, binding: ConnectorToolBinding): string {
  if (binding.config.description) return binding.config.description;
  const remote = remoteTool(connector.id, binding.remoteName)?.description;
  return remote ? fence(remote) : binding.config.labelTh;
}

/** The input schema the model fills: Winyu's own when written, else what the server last listed. */
export function inputSchemaOf(connector: McpConnectorConfig, binding: ConnectorToolBinding): z.ZodType {
  if (binding.config.input) return binding.config.input;
  const remote = remoteTool(connector.id, binding.remoteName)?.inputSchema;
  return remote ? zodOfRemote(remote) : ANY_ARGS;
}

function zodOfRemote(schema: Record<string, unknown>): z.ZodType {
  try {
    return z.fromJSONSchema(schema);
  } catch {
    return ANY_ARGS;
  }
}
