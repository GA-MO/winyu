import { TH } from "@/lib/i18n/th";
import type { Ports } from "./index";

export type PortName = keyof Ports;

export type PortUnavailableReason = "timeout" | "unreachable" | "refused" | "malformed";

/** A port whose system could not answer: it timed out, could not be reached, refused the call or sent something that is not the contract. */
export class PortUnavailable extends Error {
  readonly port: PortName;
  readonly reason: PortUnavailableReason;

  constructor(port: PortName, reason: PortUnavailableReason, detail: string) {
    super(`${port} source ${reason}: ${detail}`);
    this.name = "PortUnavailable";
    this.port = port;
    this.reason = reason;
  }
}

/** What a tool or a card gets when a system did not answer: the "data unavailable" failure, never an empty answer. */
export type PortDown = { ok: false; code: "CONNECTOR_UNAVAILABLE"; error: string };

export function portDownOf(error: PortUnavailable): PortDown {
  const text = error.port === "metrics" ? TH.cards.failed.metricsDown : TH.cards.failed.portDown(TH.cards.failed.systems[error.port]);
  return { ok: false, code: "CONNECTOR_UNAVAILABLE", error: text };
}

/** Runs work that reads a port, turning a system that did not answer into `PortDown`; any other error still throws. */
export async function unlessPortDown<T>(work: () => Promise<T>): Promise<T | PortDown> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PortUnavailable) return portDownOf(error);
    throw error;
  }
}
