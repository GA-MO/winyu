import type { z } from "zod";
import { TH } from "@/lib/i18n/th";
import { markReachable } from "@/lib/server/connectors/catalog";
import { clientFor, dropClient } from "@/lib/server/connectors/pool";
import { signedIdentityHeaders } from "@/lib/server/connectors/signed-identity";
import type { McpCallResult, McpConnectorConfig } from "@/lib/server/connectors/types";
import { accessOrNull } from "@/lib/server/request-context";
import { PortUnavailable, type PortName } from "./unavailable";

const MAX_CACHED = 500;
export const MCP_DEFAULT_TIMEOUT_MS = 4000;

/** One tool of a system's MCP contract: what the server says it does, the arguments it takes and the JSON it answers with. */
export type McpToolContract = { description: string; input: z.ZodType; output: z.ZodType };

/** A system's MCP contract, one tool per port method; shared by the demo server and Winyu's client. */
export type McpContract = Record<string, McpToolContract>;

const MCP_BACKED_CONNECTORS = ["warehouse", "hris", "lms", "leave", "sites", "calendar"] as const;

/** The admin connectors a port reports its health under when it reads over MCP. */
export type McpBackedConnector = (typeof MCP_BACKED_CONNECTORS)[number];

export function isMcpBackedConnector(id: string): id is McpBackedConnector {
  return (MCP_BACKED_CONNECTORS as readonly string[]).includes(id);
}

/** Where a system's MCP server listens, the secret Winyu signs identities with, and how long one call may take. */
export type McpEndpoint = { url: string; secret: string; timeoutMs: number };

/** Which port a client serves, the admin connector its health shows under, its contract, how long one answer is reused, and the tools never reused (writes, and reads a write changes). */
export type McpPortSpec<Contract extends McpContract> = { port: PortName; connector: McpBackedConnector; contract: Contract; cacheMs: number; fresh?: readonly (keyof Contract & string)[] };

export type McpAsk<Contract extends McpContract> = <Tool extends keyof Contract & string>(
  tool: Tool,
  args: z.input<Contract[Tool]["input"]>,
) => Promise<z.output<Contract[Tool]["output"]>>;

type Cached = { expiresAt: number; answer: Promise<unknown> };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, inner]) => [key, canonical(inner)]));
}

function textOf(raw: McpCallResult): string {
  const content = "content" in raw && Array.isArray(raw.content) ? raw.content : [];
  return content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

/** One port as a client of its system's MCP server: each method is one tool call signed as the caller, the same call within the cache window is answered once, and any failure is a `PortUnavailable` for that port. */
export function mcpPortClient<Contract extends McpContract>(spec: McpPortSpec<Contract>, endpoint: McpEndpoint): McpAsk<Contract> {
  const copy = TH.admin.connectors[spec.connector];
  const connector: McpConnectorConfig = {
    id: spec.connector,
    labelTh: copy.label,
    sourceSystemTh: copy.sourceMcp,
    transport: { type: "http", url: endpoint.url },
    auth: (access) => signedIdentityHeaders(access, endpoint.secret),
    timeoutMs: endpoint.timeoutMs,
    tools: {},
  };
  const cache = new Map<string, Cached>();
  const unavailable = (reason: PortUnavailable["reason"], detail: string) => new PortUnavailable(spec.port, reason, detail);

  function withinTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(unavailable("timeout", `no answer within ${endpoint.timeoutMs} ms`)), endpoint.timeoutMs);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }

  function payloadOf(raw: McpCallResult): unknown {
    if ("structuredContent" in raw && raw.structuredContent !== undefined) return raw.structuredContent;
    try {
      return JSON.parse(textOf(raw));
    } catch {
      throw unavailable("malformed", "the result is neither structured content nor JSON text");
    }
  }

  function parsed<Tool extends keyof Contract & string>(tool: Tool, raw: McpCallResult): z.output<Contract[Tool]["output"]> {
    if ("isError" in raw && raw.isError) throw unavailable("refused", textOf(raw));
    const result = spec.contract[tool].output.safeParse(payloadOf(raw));
    if (!result.success) throw unavailable("malformed", `${tool}: ${result.error.message}`);
    return result.data as z.output<Contract[Tool]["output"]>;
  }

  async function call<Tool extends keyof Contract & string>(tool: Tool, args: z.input<Contract[Tool]["input"]>): Promise<z.output<Contract[Tool]["output"]>> {
    const access = accessOrNull();
    const work = clientFor(connector, access).then((client) => client.callTool({ name: tool, arguments: args as Record<string, unknown>, options: { timeout: endpoint.timeoutMs } }));
    let raw: McpCallResult;
    try {
      raw = await withinTimeout(work);
    } catch (error) {
      dropClient(connector, access);
      markReachable(connector.id, false);
      throw error instanceof PortUnavailable ? error : unavailable("unreachable", error instanceof Error ? error.message : String(error));
    }
    markReachable(connector.id, true);
    return parsed(tool, raw);
  }

  function forget(now: number): void {
    for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
    while (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value ?? "");
  }

  return (tool, args) => {
    if (spec.fresh?.includes(tool)) return call(tool, args);
    const key = `${tool}:${JSON.stringify(canonical(args))}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.answer as ReturnType<McpAsk<Contract>>;
    forget(now);
    const answer = call(tool, args);
    cache.set(key, { expiresAt: now + spec.cacheMs, answer });
    answer.catch(() => {
      if (cache.get(key)?.answer === answer) cache.delete(key);
    });
    return answer;
  };
}

/** A system's endpoint from env (`WINYU_<SYSTEM>_MCP_URL`, `_SECRET`, `_TIMEOUT_MS`), with local defaults for the demo only. */
export function mcpEndpointFromEnv(system: string, defaultPort: number): McpEndpoint {
  const prefix = `WINYU_${system}_MCP`;
  return {
    url: process.env[`${prefix}_URL`] ?? `http://127.0.0.1:${defaultPort}/mcp`,
    secret: process.env[`${prefix}_SECRET`] ?? `winyu-${system.toLowerCase()}-demo-local-only`,
    timeoutMs: Number(process.env[`${prefix}_TIMEOUT_MS`] ?? MCP_DEFAULT_TIMEOUT_MS),
  };
}
