import { createHash } from "node:crypto";
import { z } from "zod";
import type { AccessContext } from "@/lib/contracts";
import { fence } from "@/lib/harness/fence";
import { collection, collectionStamp } from "@/lib/server/store/json-store";
import {
  stableJson, storedConnectorSchema, storedToolBlockers,
  type AuthKind, type RemoteHints, type StoredConnector, type StoredTool, type Upstream, type UpstreamTool,
} from "@/lib/connectors/spec";
import { markReachable } from "./catalog";
import { defineMcpConnector } from "./define";
import { egressFetch } from "./egress";
import { openMcpClient, type MCPClient } from "./mcp-client";
import { connectorScopeOf, sensitiveFieldOf } from "./presets";
import { CONNECTOR_KEY_ENV, CONNECTOR_SECRETS_COLLECTION, connectorKey, openSecret } from "./secrets";
import { signedIdentityHeaders } from "./signed-identity";
import type { McpConnector, McpToolConfig } from "./types";

export const CONNECTORS_COLLECTION = "connectors";
export const UPSTREAM_COLLECTION = "connector-upstream";

const CLIENT_NAME = "winyu";
const LIST_TIMEOUT_MS = 5000;
const SCHEMA_TEXT_KEYS = new Set(["description", "title", "examples", "default", "$comment"]);
const SCHEMA_MAPS = new Set(["properties", "patternProperties", "$defs", "definitions"]);

type ListedTools = Awaited<ReturnType<MCPClient["listTools"]>>;

function records() {
  return collection<StoredConnector>(CONNECTORS_COLLECTION);
}

function upstreams() {
  return collection<Upstream>(UPSTREAM_COLLECTION);
}

/** Every stored connector that parses; a record edited by hand into something invalid is left out, never half-trusted. */
export function storedConnectors(): StoredConnector[] {
  return records().all().flatMap((record) => {
    const parsed = storedConnectorSchema.safeParse(record);
    return parsed.success ? [parsed.data] : [];
  });
}

export function storedConnector(id: string): StoredConnector | null {
  const parsed = storedConnectorSchema.safeParse(records().get(id));
  return parsed.success ? parsed.data : null;
}

/** Writes a connector after parsing it again, so nothing incomplete is ever stored. */
export function saveStored(connector: StoredConnector): StoredConnector {
  return records().put(storedConnectorSchema.parse(connector));
}

export function upstreamOf(id: string): Upstream | null {
  return upstreams().get(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hintsOf(annotations: unknown): RemoteHints {
  const read = (key: string): boolean | null => {
    const value = isRecord(annotations) ? annotations[key] : undefined;
    return typeof value === "boolean" ? value : null;
  };
  return { readOnly: read("readOnlyHint"), destructive: read("destructiveHint"), idempotent: read("idempotentHint") };
}

/** The fingerprint of what a server says about one tool: its description, input schema and effect hints. */
export function upstreamHash(tool: Pick<UpstreamTool, "description" | "inputSchema" | "hints">): string {
  return createHash("sha256").update(stableJson({ description: tool.description, inputSchema: tool.inputSchema, hints: tool.hints })).digest("hex");
}

function upstreamToolOf(tool: ListedTools["tools"][number]): UpstreamTool {
  const base = { name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema as Record<string, unknown>, hints: hintsOf(tool.annotations) };
  return { ...base, hash: upstreamHash(base) };
}

function sameTools(left: readonly UpstreamTool[], right: readonly UpstreamTool[]): boolean {
  return stableJson(left.map((tool) => [tool.name, tool.hash])) === stableJson(right.map((tool) => [tool.name, tool.hash]));
}

/** Keeps what a server just listed as its connector's last listing; written only when it changed, so the compiled set is rebuilt only then. */
export function recordUpstream(id: string, listed: ListedTools): Upstream {
  const tools = listed.tools.map(upstreamToolOf);
  const previous = upstreamOf(id);
  if (previous && sameTools(previous.tools, tools)) return previous;
  return upstreams().put({ id, at: new Date().toISOString(), tools });
}

/** The headers that tell the server who asks: Winyu's signed identity of the person (or Winyu itself for null), or one bearer token for everyone. */
export function authHeaders(kind: AuthKind, secret: string, access: AccessContext | null): Record<string, string> {
  return kind === "bearer" ? { authorization: `Bearer ${secret}` } : signedIdentityHeaders(access, secret);
}

function within<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Runs one piece of work on a fresh client to a stored or about-to-be-stored connector, through the egress check, then closes it. */
export async function withClient<T>(target: { url: string; auth: AuthKind }, secret: string, access: AccessContext | null, work: (client: MCPClient) => Promise<T>): Promise<T> {
  const client = await within(openMcpClient({ type: "http", url: target.url, headers: authHeaders(target.auth, secret, access), fetch: egressFetch }, CLIENT_NAME), LIST_TIMEOUT_MS);
  try {
    return await within(work(client), LIST_TIMEOUT_MS);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Asks a server for its tools as Winyu itself and records the listing; marks the connector reachable or not for the health pill. */
export async function listUpstream(id: string, target: { url: string; auth: AuthKind }, secret: string): Promise<Upstream> {
  try {
    const upstream = recordUpstream(id, await withClient(target, secret, null, (client) => client.listTools()));
    markReachable(id, true);
    return upstream;
  } catch (error) {
    markReachable(id, false);
    throw error;
  }
}

function withoutSchemaText(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutSchemaText);
  if (!isRecord(schema)) return schema;
  const kept = Object.entries(schema).filter(([key]) => !SCHEMA_TEXT_KEYS.has(key));
  return Object.fromEntries(kept.map(([key, value]) => [key, SCHEMA_MAPS.has(key) && isRecord(value) ? Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, withoutSchemaText(inner)])) : withoutSchemaText(value)]));
}

/** The input schema the model fills: the pinned one with every description, title, example and default removed, as a zod object; null when it is not an object schema zod can read. */
export function modelInputOf(inputSchema: Record<string, unknown>): z.ZodObject | null {
  try {
    const schema = z.fromJSONSchema(withoutSchemaText(inputSchema) as Parameters<typeof z.fromJSONSchema>[0]);
    return schema instanceof z.ZodObject ? schema : null;
  } catch {
    return null;
  }
}

/** The tools of a stored connector that may reach the model now: tested at their current config and unchanged upstream. */
export function liveToolNames(connector: StoredConnector, upstream: Upstream | null): string[] {
  return Object.entries(connector.tools)
    .filter(([name, tool]) => storedToolBlockers(connector, name, tool, upstream).length === 0)
    .map(([name]) => name);
}

function toolConfigOf(tool: StoredTool): McpToolConfig | null {
  const input = modelInputOf(tool.pinned.inputSchema);
  if (!input) return null;
  return {
    labelTh: tool.labelTh,
    description: fence(tool.description),
    tier: tool.tier,
    roles: tool.roles,
    input,
    scope: connectorScopeOf(tool.scope),
    sensitive: tool.sensitive.map((spec) => sensitiveFieldOf(spec, `${tool.labelTh} · ${spec.field}`)),
  };
}

/** A stored connector as the connector Winyu already runs, with only its live tools; null when none is live. Every assert of `defineMcpConnector` runs on it. */
export function compileStored(connector: StoredConnector, secret: string, upstream: Upstream | null): McpConnector | null {
  const tools = liveToolNames(connector, upstream).flatMap((name) => {
    const tool = connector.tools[name];
    const config = tool ? toolConfigOf(tool) : null;
    return config ? [[name, config] as const] : [];
  });
  if (tools.length === 0) return null;
  return defineMcpConnector({
    id: connector.id,
    labelTh: connector.labelTh,
    sourceSystemTh: connector.sourceSystemTh,
    transport: { type: "http", url: connector.url, fetch: egressFetch },
    auth: (access) => authHeaders(connector.auth.kind, secret, access),
    timeoutMs: connector.timeoutMs,
    tools: Object.fromEntries(tools),
  });
}

function compiledOrSkipped(connector: StoredConnector): McpConnector[] {
  const secret = openSecret(connector.id);
  if (!secret) {
    console.warn(`[connectors] ${connector.id} is left off: its secret does not open under ${CONNECTOR_KEY_ENV}`);
    return [];
  }
  try {
    const compiled = compileStored(connector, secret, upstreamOf(connector.id));
    return compiled ? [compiled] : [];
  } catch (error) {
    console.warn(`[connectors] ${connector.id} is left off: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

let compiled: { version: string; connectors: McpConnector[] } | null = null;

function storeVersion(): string {
  return [collectionStamp(CONNECTORS_COLLECTION), collectionStamp(UPSTREAM_COLLECTION), collectionStamp(CONNECTOR_SECRETS_COLLECTION), connectorKey() ? "key" : "no-key"].join(":");
}

/** The activated stored connectors that have a live tool, compiled once per store version; one that fails to compile is left off and logged, never taking the others down. */
export function activeStoredConnectors(): McpConnector[] {
  const version = storeVersion();
  if (compiled?.version === version) return compiled.connectors;
  const connectors = storedConnectors().filter((connector) => connector.activatedAt !== null).flatMap(compiledOrSkipped);
  compiled = { version, connectors };
  return connectors;
}
