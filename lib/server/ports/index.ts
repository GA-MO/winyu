import type { CalendarPort } from "./calendar";
import type { DirectoryPort } from "./directory";
import type { LearningPort } from "./learning";
import type { LeavePort } from "./leave";
import type { MailPort } from "./mail";
import type { MetricsPort } from "./metrics";
import type { RecruitingPort } from "./recruiting";
import type { SitesPort } from "./sites";
import { GENERATOR_PORTS } from "./generator";

/** Every system of record Winyu reads or writes, one port each; Winyu holds none of their data and only calls them. A deployment fills each port with an adapter for the customer's system, the demo with the generator. */
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

let current: Ports | null = null;

/** The systems Winyu talks to right now: the generator that stands in for them in the demo, or whatever `registerPorts` installed. */
export function ports(): Ports {
  current ??= GENERATOR_PORTS;
  return current;
}

export function registerPorts(next: Partial<Ports>): void {
  current = { ...ports(), ...next };
}

export function resetPorts(): void {
  current = null;
}
