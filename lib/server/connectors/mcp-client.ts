import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";

export type { MCPClient };

export type McpTransportConfig =
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> };

async function transportFor(config: McpTransportConfig) {
  if (config.type === "http") return { type: "http" as const, url: config.url, headers: config.headers };
  const { Experimental_StdioMCPTransport: StdioMCPTransport } = await import("@ai-sdk/mcp/mcp-stdio");
  return new StdioMCPTransport({ command: config.command, args: config.args, env: config.env });
}

/** Opens one MCP client on a transport; the stdio transport loads on demand because it needs child_process. */
export async function openMcpClient(transport: McpTransportConfig, clientName: string): Promise<MCPClient> {
  return createMCPClient({ transport: await transportFor(transport), clientName });
}
