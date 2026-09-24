import type { CalendarPort } from "./calendar";
import type { DirectoryPort } from "./directory";
import type { LearningPort } from "./learning";
import type { LeavePort } from "./leave";
import type { MailPort } from "./mail";
import type { MetricsPort } from "./metrics";
import type { RecruitingPort } from "./recruiting";
import type { SitesPort } from "./sites";
import { GENERATOR_PORTS } from "./generator";

/** Every system of record Cop reads or writes, one port each; a connector replaces one without touching the logic above it. */
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

let current: Ports = GENERATOR_PORTS;

/** The systems Cop talks to right now: the generator by default, or whatever `registerPorts` installed. */
export function ports(): Ports {
  return current;
}

export function registerPorts(next: Partial<Ports>): void {
  current = { ...current, ...next };
}

export function resetPorts(): void {
  current = GENERATOR_PORTS;
}
