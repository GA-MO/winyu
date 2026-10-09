import { NATIVE_TOOL_NAMES } from "@/lib/contracts";
import type { ReservedReason } from "@/lib/connectors/spec";
import { CALENDAR_MCP_TOOLS, calendarMcpEnv } from "@/lib/server/ports/calendar-mcp-contract";
import { HRIS_MCP_TOOLS, hrisMcpEnv } from "@/lib/server/ports/hris-mcp-contract";
import { LEARNING_MCP_TOOLS, learningMcpEnv } from "@/lib/server/ports/learning-mcp-contract";
import { METRICS_MCP_TOOLS, metricsMcpEnv } from "@/lib/server/ports/metrics-mcp-contract";
import { SITES_MCP_TOOLS, sitesMcpEnv } from "@/lib/server/ports/sites-mcp-contract";
import { CODE_CONNECTORS } from "./code";

type ServedTools = { url: string; tools: readonly string[] };

function portServers(): ServedTools[] {
  return [
    { url: learningMcpEnv().url, tools: Object.keys(LEARNING_MCP_TOOLS) },
    { url: hrisMcpEnv().url, tools: Object.keys(HRIS_MCP_TOOLS) },
    { url: sitesMcpEnv().url, tools: Object.keys(SITES_MCP_TOOLS) },
    { url: calendarMcpEnv().url, tools: Object.keys(CALENDAR_MCP_TOOLS) },
    { url: metricsMcpEnv().url, tools: Object.keys(METRICS_MCP_TOOLS) },
  ];
}

function codeServers(): ServedTools[] {
  return CODE_CONNECTORS.flatMap((connector) => (connector.config.transport.type === "http" ? [{ url: connector.config.transport.url, tools: Object.keys(connector.config.tools) }] : []));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function servedOn(servers: readonly ServedTools[], host: string, tool: string): boolean {
  return servers.some((server) => hostOf(server.url) === host && server.tools.includes(tool));
}

/** Why a console connector may not open this remote tool: it is named like one of Winyu's own tools, a Winyu port already reads it from the same server, or a code connector already opens it there; null when it may. */
export function reservedReasonOf(url: string, tool: string): ReservedReason | null {
  if ((NATIVE_TOOL_NAMES as readonly string[]).includes(tool)) return "native_tool";
  const host = hostOf(url);
  if (!host) return null;
  if (servedOn(portServers(), host, tool)) return "port_tool";
  return servedOn(codeServers(), host, tool) ? "code_tool" : null;
}
