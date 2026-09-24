import { clientFor, dropClient } from "./pool";
import { learnRemoteTools, markReachable } from "./catalog";
import { mcpConnectors } from "./index";
import type { RemoteTool } from "./catalog";
import type { McpConnector, McpToolConfig } from "./types";

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
  if (drift.unused.length > 0) console.info(`[connectors] ${drift.connector} offers tools Cop leaves closed: ${drift.unused.join(", ")}`);
}

/** Compares what each server offers with what Cop declares and logs the difference; never opens a tool the config does not name. */
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
