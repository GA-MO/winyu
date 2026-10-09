import { NATIVE_TOOL_NAMES } from "@/lib/contracts";
import type { ReservedReason } from "@/lib/connectors/spec";
import { CODE_CONNECTORS } from "./code";

type ServedTools = { url: string; tools: readonly string[] };

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

/** Why a console connector may not open this remote tool: it is named like one of Winyu's own tools, or a code connector already opens it on the same server; null when it may. */
export function reservedReasonOf(url: string, tool: string): ReservedReason | null {
  if ((NATIVE_TOOL_NAMES as readonly string[]).includes(tool)) return "native_tool";
  const host = hostOf(url);
  if (!host) return null;
  return servedOn(codeServers(), host, tool) ? "code_tool" : null;
}
