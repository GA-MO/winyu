import { randomBytes } from "node:crypto";
import { IncomingMessage, ServerResponse, type OutgoingHttpHeader, type OutgoingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { MCPServer } from "@mastra/mcp";
import { createTool } from "@mastra/core/tools";
import { Server, createMcpHandler, isLegacyRequest } from "@modelcontextprotocol/server";
import type { WinyuTool } from "@/lib/server/tools/define";

const SERVER_ID = "mascop";
const SERVER_VERSION = "0.1.0";
const CONTINUATION_KEY = randomBytes(32);
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 204, 205, 304]);
const NO_RESPONSE = { jsonrpc: "2.0", error: { code: -32603, message: "MCP server wrote no response" }, id: null };

/** What the MCP endpoint serves one caller: the tools they may call, what a tool result looks like as text, and how to use the server. */
export type McpSurface = { tools: readonly WinyuTool[]; render: (output: unknown) => string; instructions: string };

class ParsedRequest extends IncomingMessage {
  readonly body: unknown;

  constructor(request: Request, body: unknown) {
    super(new Socket());
    const url = new URL(request.url);
    this.method = request.method;
    this.url = `${url.pathname}${url.search}`;
    this.headers = Object.fromEntries(request.headers);
    this.body = body;
  }
}

class CapturedResponse extends ServerResponse {
  readonly response: Promise<Response>;
  private resolveResponse: (response: Response) => void = () => undefined;
  private body: ReadableStreamDefaultController<Uint8Array> | null = null;

  constructor(request: IncomingMessage) {
    super(request);
    this.response = new Promise((resolve) => {
      this.resolveResponse = resolve;
    });
  }

  override writeHead(statusCode: number, headersOrMessage?: string | OutgoingHttpHeaders | OutgoingHttpHeader[], maybeHeaders?: OutgoingHttpHeaders | OutgoingHttpHeader[]): this {
    const raw = typeof headersOrMessage === "string" ? maybeHeaders : headersOrMessage;
    const headers = new Headers();
    for (const [name, value] of Object.entries(raw && !Array.isArray(raw) ? raw : {})) if (value !== undefined) headers.set(name, String(value));
    if (NULL_BODY_STATUSES.has(statusCode)) {
      this.resolveResponse(new Response(null, { status: statusCode, headers }));
      return this;
    }
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.body = controller;
      },
      cancel: () => {
        this.emit("close");
      },
    });
    this.resolveResponse(new Response(stream, { status: statusCode, headers }));
    return this;
  }

  override write(chunk: string | Uint8Array): boolean {
    this.body?.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    return true;
  }

  override end(chunk?: unknown): this {
    if (typeof chunk === "string" || chunk instanceof Uint8Array) this.write(chunk);
    this.body?.close();
    this.body = null;
    this.emit("close");
    return this;
  }
}

function mcpToolOf(winyuTool: WinyuTool, render: McpSurface["render"]) {
  return createTool({
    id: winyuTool.entry.name,
    description: winyuTool.description(),
    inputSchema: winyuTool.inputSchema(),
    execute: async (input: unknown) => render(await winyuTool.execute(input)),
  });
}

/** One answered MCP request: the response as soon as its head is written (a stream keeps filling it), and when the server has finished writing it. */
export type ServedMcp = { response: Response; finished: Promise<void> };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function legacyServerOver(server: MCPServer, instructions: string): Server {
  const legacy = new Server({ name: SERVER_ID, version: SERVER_VERSION }, { capabilities: { tools: {} }, instructions });
  legacy.setRequestHandler("tools/list", async () => {
    const { tools } = await server.getToolListInfo();
    return { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema: { ...inputSchema, type: "object" as const } })) };
  });
  legacy.setRequestHandler("tools/call", async (call) => {
    try {
      const result = await server.executeTool(call.params.name, call.params.arguments ?? {});
      return { content: [{ type: "text" as const, text: result.status === "completed" ? String(result.output) : "" }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: errorText(error) }] };
    }
  });
  return legacy;
}

async function servedLegacy(server: MCPServer, request: Request, body: unknown, instructions: string): Promise<ServedMcp> {
  const handler = createMcpHandler(() => legacyServerOver(server, instructions), { legacy: "stateless" });
  try {
    const answered = await handler.fetch(request, { parsedBody: body });
    const response = new Response(answered.body ? await answered.text() : null, { status: answered.status, headers: answered.headers });
    return { response, finished: Promise.resolve() };
  } finally {
    await handler.close();
    await server.close();
  }
}

function servedModern(server: MCPServer, request: Request, body: unknown): Promise<ServedMcp> {
  const req = new ParsedRequest(request, body);
  const res = new CapturedResponse(req);
  const url = new URL(request.url);
  const finished = server.startHTTP({ url, httpPath: url.pathname, req, res }).finally(() => server.close());
  const unanswered = finished.then(() => Response.json(NO_RESPONSE, { status: 500 }));
  return Promise.race([res.response, unanswered]).then((response) => ({ response, finished }));
}

/** Answers one MCP Streamable HTTP request with a Mastra MCPServer built for this caller alone, so its tool list is exactly theirs: 2026-07-28 traffic through Mastra's own transport, 2025-era clients through a stateless shim over the same tools. The caller's access, turn and run must already be set, because every tool executes through the gateway in this async context. */
export async function serveMcp(request: Request, body: unknown, surface: McpSurface): Promise<ServedMcp> {
  const server = new MCPServer({
    id: SERVER_ID,
    name: SERVER_ID,
    version: SERVER_VERSION,
    instructions: surface.instructions,
    requestState: { key: CONTINUATION_KEY },
    tools: Object.fromEntries(surface.tools.map((tool) => [tool.entry.name, mcpToolOf(tool, surface.render)])),
  });
  if (await isLegacyRequest(request, body)) return servedLegacy(server, request, body, surface.instructions);
  return servedModern(server, request, body);
}
