import { verifiedIdentity, type SignedIdentity } from "@/lib/server/connectors/signed-identity";

const MCP_PATH = "/mcp";
const DEFAULT_PROTOCOL = "2025-06-18";

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> };

/** One tool a demo server offers: what `tools/list` says about it and the payload a call returns for the signed caller. */
export type DemoMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>, identity: SignedIdentity) => unknown | Promise<unknown>;
};

/** A demo system served as a minimal MCP server over HTTP: JSON-RPC on POST /mcp, only for callers whose identity Winyu signed. */
export type DemoMcpServer = { info: { name: string; version: string }; secret: () => string; tools: readonly DemoMcpTool[] };

function reply(id: JsonRpcRequest["id"], result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function failure(id: JsonRpcRequest["id"], code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

function listed(tool: DemoMcpTool) {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}

async function called(tool: DemoMcpTool, args: Record<string, unknown>, identity: SignedIdentity) {
  const payload = await tool.call(args, identity);
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
}

async function answer(server: DemoMcpServer, request: JsonRpcRequest, identity: SignedIdentity): Promise<Response> {
  if (request.id === undefined) return new Response(null, { status: 202 });
  if (request.method === "initialize") {
    return reply(request.id, { protocolVersion: request.params?.protocolVersion ?? DEFAULT_PROTOCOL, capabilities: { tools: {} }, serverInfo: server.info });
  }
  if (request.method === "tools/list") return reply(request.id, { tools: server.tools.map(listed) });
  if (request.method !== "tools/call") return failure(request.id, -32601, `method ${request.method} not found`);
  const tool = server.tools.find((candidate) => candidate.name === request.params?.name);
  if (!tool) return reply(request.id, { isError: true, content: [{ type: "text", text: `unknown tool ${String(request.params?.name)}` }] });
  return reply(request.id, await called(tool, (request.params?.arguments ?? {}) as Record<string, unknown>, identity));
}

/** The fetch handler of one demo MCP server. */
export function mcpDemoFetch(server: DemoMcpServer): (request: Request) => Promise<Response> {
  return async (request) => {
    if (new URL(request.url).pathname !== MCP_PATH) return new Response("not found", { status: 404 });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const identity = verifiedIdentity(request.headers, server.secret());
    if (!identity) return failure(undefined, -32001, "identity signature missing or wrong", 401);
    return answer(server, (await request.json()) as JsonRpcRequest, identity);
  };
}

/** The port a demo server listens on: the one in the URL Winyu is told to reach it at, so one env var moves both. */
export function portOf(url: string): number {
  return Number(new URL(url).port);
}
