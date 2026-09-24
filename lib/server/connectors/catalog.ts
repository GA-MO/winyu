import type { MCPClient } from "vexa/server";
import { collection } from "@/lib/server/store/json-store";

export type RemoteTool = { name: string; description?: string; inputSchema: Record<string, unknown> };

type ListedTools = Awaited<ReturnType<MCPClient["listTools"]>>;

export type ConnectorHealth = "online" | "offline" | "unknown";

export const CONNECTOR_HEALTH_COLLECTION = "connector-health";

type HealthEntry = { id: string; reachable: boolean; at: string };

const catalogs = new Map<string, Map<string, RemoteTool>>();

function healthLog() {
  return collection<HealthEntry>(CONNECTOR_HEALTH_COLLECTION);
}

/** Records whether the last attempt to reach a connector worked, for the admin's status pill; written only when it changes. */
export function markReachable(connector: string, reachable: boolean): void {
  if (healthLog().get(connector)?.reachable === reachable) return;
  healthLog().put({ id: connector, reachable, at: new Date().toISOString() });
}

export function connectorHealth(connector: string): ConnectorHealth {
  const entry = healthLog().get(connector);
  if (!entry) return "unknown";
  return entry.reachable ? "online" : "offline";
}

/** Remembers what a server says its tools are, so descriptions and schemas are known without a round trip per turn. */
export function learnRemoteTools(connector: string, listed: ListedTools): RemoteTool[] {
  const tools = listed.tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema as Record<string, unknown> }));
  catalogs.set(connector, new Map(tools.map((tool) => [tool.name, tool])));
  markReachable(connector, true);
  return tools;
}

export function remoteTool(connector: string, name: string): RemoteTool | null {
  return catalogs.get(connector)?.get(name) ?? null;
}

export function forgetRemoteTools(): void {
  catalogs.clear();
  for (const entry of healthLog().all()) healthLog().remove(entry.id);
}
