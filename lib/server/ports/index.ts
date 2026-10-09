import type { CalendarPort } from "./calendar";
import type { DirectoryPort } from "./directory";
import type { LearningPort } from "./learning";
import type { LeavePort } from "./leave";
import type { MailPort } from "./mail";
import type { MetricsPort } from "./metrics";
import type { RecruitingPort } from "./recruiting";
import type { SitesPort } from "./sites";
import { GENERATOR_PORTS } from "./generator";
import { metricsMcpEnv } from "./metrics-mcp-contract";
import { metricsMcpPort } from "./metrics-mcp";
import type { McpBackedConnector } from "./mcp-port";

/** Every system of record Winyu reads or writes, one port each; a connector replaces one without touching the logic above it. */
export type Ports = {
  metrics: MetricsPort;
  directory: DirectoryPort;
  recruiting: RecruitingPort;
  learning: LearningPort;
  leave: LeavePort;
  sites: SitesPort;
  calendar: CalendarPort;
  mail: MailPort;
};

/** Each port that can read over MCP: how Winyu builds its client and the admin connector its health shows under. */
const MCP_PORTS = {
  metrics: { adapter: () => metricsMcpPort(metricsMcpEnv()), connector: "warehouse" },
} satisfies { [Port in keyof Ports]?: { adapter: () => Ports[Port]; connector: McpBackedConnector } };

export type McpPortName = keyof typeof MCP_PORTS;

export type PortSource = "generator" | "mcp";

const MCP_PORT_NAMES = Object.keys(MCP_PORTS) as McpPortName[];
const EVERY_PORT = "mcp";

function isMcpPortName(name: string): name is McpPortName {
  return (MCP_PORT_NAMES as string[]).includes(name);
}

/** The ports read over MCP: all of them for `WINYU_PORTS=mcp`, the named ones for a comma list such as `WINYU_PORTS=metrics,directory`, none when unset or `generator`. */
export function mcpPortNames(): McpPortName[] {
  const setting = (process.env.WINYU_PORTS ?? "").trim();
  if (setting === EVERY_PORT) return MCP_PORT_NAMES;
  return setting.split(",").map((name) => name.trim()).filter(isMcpPortName);
}

export function portSource(port: McpPortName): PortSource {
  return mcpPortNames().includes(port) ? "mcp" : "generator";
}

/** Whether any port reporting under this admin connector reads over MCP, so the admin shows it as an MCP connection with its health. */
export function readsOverMcp(connector: McpBackedConnector): boolean {
  return mcpPortNames().some((port) => MCP_PORTS[port].connector === connector);
}

function configuredPorts(): Ports {
  const configured: Ports = { ...GENERATOR_PORTS };
  for (const port of mcpPortNames()) Object.assign(configured, { [port]: MCP_PORTS[port].adapter() });
  return configured;
}

let current: Ports | null = null;

/** The systems Winyu talks to right now: the configured ones (the generator unless env says otherwise), or whatever `registerPorts` installed. */
export function ports(): Ports {
  current ??= configuredPorts();
  return current;
}

export function registerPorts(next: Partial<Ports>): void {
  current = { ...ports(), ...next };
}

export function resetPorts(): void {
  current = null;
}
