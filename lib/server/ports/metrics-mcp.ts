import { markReachable } from "@/lib/server/connectors/catalog";
import { clientFor, dropClient } from "@/lib/server/connectors/pool";
import { signedIdentityHeaders } from "@/lib/server/connectors/signed-identity";
import type { McpCallResult, McpConnectorConfig } from "@/lib/server/connectors/types";
import { accessOrNull } from "@/lib/server/request-context";
import { TH } from "@/lib/i18n/th";
import { METRICS_MCP_TOOLS, type MetricsMcpInput, type MetricsMcpOutput, type MetricsMcpTool } from "./metrics-mcp-contract";
import { MetricsUnavailable, type MetricsPort } from "./metrics";

/** The metrics source reports its health under the warehouse connector, the one its tools already sit under in the admin. */
export const METRICS_CONNECTOR_ID = "warehouse";

const DEFAULT_CACHE_MS = 30_000;
const MAX_CACHED = 500;

export type MetricsMcpOptions = { url: string; secret: string; timeoutMs: number; cacheMs?: number };

type Cached = { expiresAt: number; answer: Promise<unknown> };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, inner]) => [key, canonical(inner)]));
}

function withinTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new MetricsUnavailable("timeout", `no answer within ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function textOf(raw: McpCallResult): string {
  const content = "content" in raw && Array.isArray(raw.content) ? raw.content : [];
  return content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

function payloadOf(raw: McpCallResult): unknown {
  if ("structuredContent" in raw && raw.structuredContent !== undefined) return raw.structuredContent;
  try {
    return JSON.parse(textOf(raw));
  } catch {
    throw new MetricsUnavailable("malformed", "the result is neither structured content nor JSON text");
  }
}

function parsedAs<Tool extends MetricsMcpTool>(tool: Tool, raw: McpCallResult): MetricsMcpOutput<Tool> {
  if ("isError" in raw && raw.isError) throw new MetricsUnavailable("refused", textOf(raw));
  const parsed = METRICS_MCP_TOOLS[tool].output.safeParse(payloadOf(raw));
  if (!parsed.success) throw new MetricsUnavailable("malformed", `${tool}: ${parsed.error.message}`);
  return parsed.data as MetricsMcpOutput<Tool>;
}

/** The metrics port as a client of the data team's MCP server: each scoped request is one tool call, calls run in parallel, the same request within a short window is answered once, and any failure is a `MetricsUnavailable`. */
export function metricsMcpPort(options: MetricsMcpOptions): MetricsPort {
  const connector: McpConnectorConfig = {
    id: METRICS_CONNECTOR_ID,
    labelTh: TH.admin.connectors.warehouse.label,
    sourceSystemTh: TH.admin.connectors.warehouse.sourceMcp,
    transport: { type: "http", url: options.url },
    auth: (access) => signedIdentityHeaders(access, options.secret),
    timeoutMs: options.timeoutMs,
    tools: {},
  };
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  const cache = new Map<string, Cached>();

  async function ask<Tool extends MetricsMcpTool>(tool: Tool, args: MetricsMcpInput<Tool>): Promise<MetricsMcpOutput<Tool>> {
    const access = accessOrNull();
    const work = clientFor(connector, access).then((client) => client.callTool({ name: tool, arguments: args, options: { timeout: options.timeoutMs } }));
    let raw: McpCallResult;
    try {
      raw = await withinTimeout(work, options.timeoutMs);
    } catch (error) {
      dropClient(connector, access);
      markReachable(connector.id, false);
      throw error instanceof MetricsUnavailable ? error : new MetricsUnavailable("unreachable", error instanceof Error ? error.message : String(error));
    }
    markReachable(connector.id, true);
    return parsedAs(tool, raw);
  }

  function forget(now: number): void {
    for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
    while (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value ?? "");
  }

  function cached<Tool extends MetricsMcpTool>(tool: Tool, args: MetricsMcpInput<Tool>): Promise<MetricsMcpOutput<Tool>> {
    const key = `${tool}:${JSON.stringify(canonical(args))}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.answer as Promise<MetricsMcpOutput<Tool>>;
    forget(now);
    const answer = ask(tool, args);
    cache.set(key, { expiresAt: now + cacheMs, answer });
    answer.catch(() => {
      if (cache.get(key)?.answer === answer) cache.delete(key);
    });
    return answer;
  }

  return {
    readFacts: (requests) => Promise.all(requests.map((request) => cached("query_facts", request))),
    masterData: () => cached("master_data", {}),
    listMetrics: async (search) => (await cached("list_metrics", { search })).metrics,
    describeEntity: (kind, query) => cached("describe_entity", { kind, query }),
  };
}
