import { openMcpClient, type MCPClient, type McpTransportConfig } from "./mcp-client";
import type { AccessContext } from "@/lib/contracts";
import { learnRemoteTools, markReachable } from "./catalog";
import type { McpConnectorConfig } from "./types";

export type ConnectorClient = Pick<MCPClient, "callTool" | "listTools" | "close">;
export type ConnectorClientFactory = (connector: string, transport: McpTransportConfig) => Promise<ConnectorClient>;

const CLIENT_TTL_MS = 10 * 60 * 1000;
const WINYU_ITSELF = "winyu";
const CLIENT_NAME = "mascop";

type Pooled = { client: Promise<ConnectorClient>; expiresAt: number };

const openClient: ConnectorClientFactory = (_connector, transport) => openMcpClient(transport, CLIENT_NAME);

let factory: ConnectorClientFactory = openClient;
const pool = new Map<string, Pooled>();

function keyOf(connector: McpConnectorConfig, access: AccessContext | null): string {
  return `${connector.id}:${access?.userId ?? WINYU_ITSELF}`;
}

function withHeaders(transport: McpTransportConfig, headers: Record<string, string>): McpTransportConfig {
  if (transport.type !== "http") return transport;
  return { ...transport, headers: { ...transport.headers, ...headers } };
}

function close(pooled: Pooled | undefined): void {
  pooled?.client.then((client) => client.close()).catch(() => undefined);
}

function open(connector: McpConnectorConfig, access: AccessContext | null): Promise<ConnectorClient> {
  const client = factory(connector.id, withHeaders(connector.transport, connector.auth(access)));
  client.then((ready) => ready.listTools()).then((listed) => learnRemoteTools(connector.id, listed)).catch(() => markReachable(connector.id, false));
  return client;
}

/** A client that speaks to the connector as the person asking (or as Winyu itself for null), reused for ten minutes. */
export function clientFor(connector: McpConnectorConfig, access: AccessContext | null): Promise<ConnectorClient> {
  const key = keyOf(connector, access);
  const pooled = pool.get(key);
  if (pooled && pooled.expiresAt > Date.now()) return pooled.client;
  close(pooled);
  const client = open(connector, access);
  pool.set(key, { client, expiresAt: Date.now() + CLIENT_TTL_MS });
  client.catch(() => pool.delete(key));
  return client;
}

/** Forgets a client that failed, so the next call connects again. */
export function dropClient(connector: McpConnectorConfig, access: AccessContext | null): void {
  const key = keyOf(connector, access);
  close(pool.get(key));
  pool.delete(key);
}

export function registerClientFactory(next: ConnectorClientFactory): void {
  resetClientPool();
  factory = next;
}

export function resetClientPool(): void {
  for (const pooled of pool.values()) close(pooled);
  pool.clear();
  factory = openClient;
}
