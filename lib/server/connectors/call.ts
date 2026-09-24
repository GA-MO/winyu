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
import type { ConnectorRow, ConnectorToolBinding, McpCallResult, McpConnectorConfig } from "./types";

export const CONNECTOR_UNAVAILABLE = "CONNECTOR_UNAVAILABLE";
export const CONNECTOR_FAILED = "CONNECTOR_FAILED";
export const PERMISSION_DENIED = "PERMISSION_DENIED";
export const TOOL_NOT_ALLOWED = "TOOL_NOT_ALLOWED";

const ANY_ARGS = z.looseObject({});

export type ConnectorToolResult =
  | { ok: true; summary: string; rows: ConnectorRow[]; provenance: { sourceSystem: string; asOf: string; masked: string[] } }
  | { ok: false; code: typeof CONNECTOR_UNAVAILABLE | typeof CONNECTOR_FAILED | typeof PERMISSION_DENIED | typeof TOOL_NOT_ALLOWED; error: string };

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

function argsOf(binding: ConnectorToolBinding, input: unknown): Record<string, unknown> {
  return (binding.config.input ?? ANY_ARGS).parse(input) as Record<string, unknown>;
}

function summaryOf(binding: ConnectorToolBinding, summary: string | undefined, count: number): string {
  if (count === 0 && !("kind" in binding.config.scope)) return TH.admin.connectors.noneInScope(binding.config.labelTh);
  return summary ?? TH.admin.connectors.rows(binding.config.labelTh, count);
}

async function shaped(connector: McpConnectorConfig, binding: ConnectorToolBinding, raw: McpCallResult, access: AccessContext): Promise<ConnectorToolResult> {
  const output = binding.config.output ? binding.config.output(raw) : genericOutput(raw);
  const inScope = await scopedRows(binding.config.scope, output.rows, access);
  if (output.rows.length > 0 && inScope.length === 0) return { ok: false, code: PERMISSION_DENIED, error: TH.admin.connectors.outOfScope(binding.config.labelTh) };
  const { rows, masked } = maskedRows(inScope, binding.fields, access);
  return {
    ok: true,
    summary: summaryOf(binding, output.summary, rows.length),
    rows: fencedRows(rows.slice(0, MAX_CONNECTOR_ROWS)),
    provenance: { sourceSystem: connector.sourceSystemTh, asOf: output.asOf ?? new Date().toISOString(), masked },
  };
}

/** One call to a connector tool as the person asking: Cop's scope on the way in, the server as that person, then Cop's scope, masking and fence on the way out. */
export async function callConnectorTool(connector: McpConnectorConfig, binding: ConnectorToolBinding, input: unknown): Promise<ConnectorToolResult> {
  const access = currentAccess();
  if (!isToolAllowed(withAdminSwitches(access), binding.name)) return { ok: false, code: TOOL_NOT_ALLOWED, error: TH.admin.connectors.notAllowed(binding.config.labelTh) };
  const args = scopedArgs(binding.config.scope, argsOf(binding, input), access);
  const raw = await callRemote(connector, binding, args, access);
  if (!raw) return { ok: false, code: CONNECTOR_UNAVAILABLE, error: TH.admin.connectors.unavailable(connector.labelTh) };
  if (isRemoteError(raw)) return { ok: false, code: CONNECTOR_FAILED, error: `${TH.admin.connectors.failed(connector.labelTh)}: ${remoteErrorText(raw)}` };
  return shaped(connector, binding, raw, access);
}

function descriptionOf(connector: McpConnectorConfig, binding: ConnectorToolBinding): string {
  if (binding.config.description) return binding.config.description;
  const remote = remoteTool(connector.id, binding.remoteName)?.description;
  return remote ? fence(remote) : binding.config.labelTh;
}

function inputSchemaOf(connector: McpConnectorConfig, binding: ConnectorToolBinding) {
  if (binding.config.input) return binding.config.input;
  const remote = remoteTool(connector.id, binding.remoteName)?.inputSchema;
  return remote ? jsonSchema(remote) : ANY_ARGS;
}

/** The AI SDK tool the handler hands the model; description and schema follow what the server last said, unless Cop wrote its own. */
export function executableOf(connector: McpConnectorConfig, binding: ConnectorToolBinding, execute: (input: unknown) => Promise<ConnectorToolResult>): Tool {
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
