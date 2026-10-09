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

export type MetricsSource = "generator" | "mcp";

/** Where metrics come from: the data team's MCP server when `WINYU_METRICS=mcp`, else the in-process generator. */
export function metricsSource(): MetricsSource {
  return process.env.WINYU_METRICS === "mcp" ? "mcp" : "generator";
}

function configuredPorts(): Ports {
  if (metricsSource() === "generator") return GENERATOR_PORTS;
  return { ...GENERATOR_PORTS, metrics: metricsMcpPort(metricsMcpEnv()) };
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
