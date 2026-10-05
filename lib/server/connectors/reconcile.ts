import { clientFor, dropClient } from "./pool";
import { learnRemoteTools, markReachable } from "./catalog";
import { mcpConnectors } from "./index";
import type { RemoteTool } from "./catalog";
import type { McpConnector, McpToolConfig } from "./types";

const PROBE_EVERY_MS = 5 * 60_000;
const PROBE_STARTED = Symbol.for("mascop.connectorProbe.started");

type ProbeGlobal = typeof globalThis & { [PROBE_STARTED]?: ReturnType<typeof setInterval> };

export type ConnectorDrift = { connector: string; missing: string[]; unused: string[]; mismatched: string[] };

function remoteProperties(tool: RemoteTool): string[] {
  const properties = tool.inputSchema.properties;
  return typeof properties === "object" && properties !== null ? Object.keys(properties) : [];
}

function schemaDiffers(declared: McpToolConfig, remote: RemoteTool): boolean {
  if (!declared.input) return false;
  const offered = remoteProperties(remote);
  return Object.keys(declared.input.shape).some((key) => !offered.includes(key));
}

async function driftOf(connector: McpConnector): Promise<ConnectorDrift> {
  const client = await clientFor(connector.config, null);
  const listed = learnRemoteTools(connector.def.id, await client.listTools());
  const offered = new Map(listed.map((tool) => [tool.name, tool]));
  const declared = Object.entries(connector.config.tools);
  return {
    connector: connector.def.id,
    missing: declared.filter(([name]) => !offered.has(name)).map(([name]) => name),
    unused: [...offered.keys()].filter((name) => !(name in connector.config.tools)),
    mismatched: declared.filter(([name, tool]) => offered.has(name) && schemaDiffers(tool, offered.get(name) as RemoteTool)).map(([name]) => name),
  };
}

function report(drift: ConnectorDrift): void {
  if (drift.missing.length > 0) console.warn(`[connectors] ${drift.connector} does not offer declared tools: ${drift.missing.join(", ")}`);
  if (drift.mismatched.length > 0) console.warn(`[connectors] ${drift.connector} input schema differs from the config for: ${drift.mismatched.join(", ")}`);
  if (drift.unused.length > 0) console.info(`[connectors] ${drift.connector} offers tools Winyu leaves closed: ${drift.unused.join(", ")}`);
}

/** Compares what each server offers with what Winyu declares and logs the difference; never opens a tool the config does not name. */
export async function reconcileConnectors(): Promise<ConnectorDrift[]> {
  const drifts: ConnectorDrift[] = [];
  for (const connector of mcpConnectors()) {
    try {
      const drift = await driftOf(connector);
      report(drift);
      drifts.push(drift);
    } catch (error) {
      dropClient(connector.config, null);
      markReachable(connector.def.id, false);
      console.warn(`[connectors] ${connector.def.id} is unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return drifts;
}

async function probe(connector: McpConnector): Promise<void> {
  try {
    const client = await clientFor(connector.config, null);
    learnRemoteTools(connector.def.id, await client.listTools());
  } catch {
    dropClient(connector.config, null);
    markReachable(connector.def.id, false);
  }
}

/** Asks every connector for its tool list so the admin's status pill follows a server that stopped or came back. */
export async function probeConnectors(): Promise<void> {
  await Promise.all(mcpConnectors().map(probe));
}

/** Probes the connectors every few minutes, once per server process however many module copies load this file. */
export function startConnectorProbe(): void {
  const scope = globalThis as ProbeGlobal;
  if (scope[PROBE_STARTED]) return;
  scope[PROBE_STARTED] = setInterval(() => {
    probeConnectors().catch((error: unknown) => console.error("[mascop] connector probe failed", error));
  }, PROBE_EVERY_MS);
}
