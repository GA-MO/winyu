import { z } from "zod";
import { Server, createMcpHandler } from "@modelcontextprotocol/server";
import { verifiedIdentity, type SignedIdentity } from "@/lib/server/connectors/signed-identity";
import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import type { MetricsPort } from "@/lib/server/ports/metrics";
import {
  METRICS_MCP_PORT, METRICS_MCP_TOOLS, metricsMcpEnv,
  type MetricsMcpInput, type MetricsMcpOutput, type MetricsMcpTool,
} from "@/lib/server/ports/metrics-mcp-contract";

const MCP_PATH = "/mcp";
const HOST = "127.0.0.1";
const SERVER_INFO = { name: "winyu-metrics-demo", version: "0.1.0" };
const UNSIGNED = { jsonrpc: "2.0", id: null, error: { code: -32001, message: "identity signature missing or wrong" } };

type Handlers = { [Tool in MetricsMcpTool]: (port: MetricsPort, input: MetricsMcpInput<Tool>) => Promise<MetricsMcpOutput<Tool>> };

const HANDLERS: Handlers = {
  query_facts: async (port, request) => (await port.readFacts([request]))[0],
  master_data: (port) => port.masterData(),
  list_metrics: async (port, { search }) => ({ metrics: await port.listMetrics(search) }),
  describe_entity: (port, { kind, query }) => port.describeEntity(kind, query),
};

const TOOL_NAMES = Object.keys(METRICS_MCP_TOOLS) as MetricsMcpTool[];

/** What the demo data team's server needs: the warehouse it reads, the secret it checks Winyu's signature with, and where its audit lines go. */
export type MetricsMcpOptions = { port: MetricsPort; secret: string; audit: (line: string) => void };

function isTool(name: string): name is MetricsMcpTool {
  return (TOOL_NAMES as string[]).includes(name);
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema);
}

function toolList() {
  return TOOL_NAMES.map((name) => ({
    name,
    description: METRICS_MCP_TOOLS[name].description,
    inputSchema: { ...jsonSchemaOf(METRICS_MCP_TOOLS[name].input), type: "object" as const },
  }));
}

function errorResult(text: string) {
  return { isError: true, content: [{ type: "text" as const, text }] };
}

async function answer<Tool extends MetricsMcpTool>(port: MetricsPort, tool: Tool, args: unknown): Promise<MetricsMcpOutput<Tool> | string> {
  const parsed = METRICS_MCP_TOOLS[tool].input.safeParse(args);
  if (!parsed.success) return `bad arguments for ${tool}: ${parsed.error.message}`;
  const handler = HANDLERS[tool] as (port: MetricsPort, input: unknown) => Promise<MetricsMcpOutput<Tool>>;
  return handler(port, parsed.data);
}

function serverFor(options: MetricsMcpOptions, caller: SignedIdentity): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler("tools/list", async () => ({ tools: toolList() }));
  server.setRequestHandler("tools/call", async (call) => {
    const name = call.params.name;
    const started = performance.now();
    if (!isTool(name)) return errorResult(`unknown tool ${name}`);
    const output = await answer(options.port, name, call.params.arguments ?? {});
    options.audit(`${new Date().toISOString()} caller=${caller.userId} role=${caller.role} tool=${name} ms=${Math.round(performance.now() - started)}${typeof output === "string" ? " refused" : ""}`);
    if (typeof output === "string") return errorResult(output);
    return { content: [{ type: "text" as const, text: JSON.stringify(output) }], structuredContent: output };
  });
  return server;
}

/** One HTTP request to the demo metrics MCP: only callers whose identity Winyu signed get in; scope is already in every request, so the server only reads and logs who asked. */
export function metricsMcpFetch(options: MetricsMcpOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (new URL(request.url).pathname !== MCP_PATH) return new Response("not found", { status: 404 });
    const caller = verifiedIdentity(request.headers, options.secret);
    if (!caller) return Response.json(UNSIGNED, { status: 401 });
    const handler = createMcpHandler(() => serverFor(options, caller), { legacy: "stateless" });
    try {
      const answered = await handler.fetch(request);
      return new Response(answered.body ? await answered.text() : null, { status: answered.status, headers: answered.headers });
    } finally {
      await handler.close();
    }
  };
}

if (import.meta.main) {
  const port = Number(process.env.WINYU_METRICS_MCP_PORT ?? METRICS_MCP_PORT);
  const fetch = metricsMcpFetch({ port: GENERATOR_PORTS.metrics, secret: metricsMcpEnv().secret, audit: (line) => console.log(line) });
  const server = Bun.serve({ port, hostname: HOST, fetch });
  console.log(`Metrics demo MCP (data team) on ${server.url}mcp`);
}
