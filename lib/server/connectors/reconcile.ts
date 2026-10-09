import { openSecret } from "./secrets";
import { listUpstream, storedConnectors } from "./stored";
import type { StoredConnector } from "@/lib/connectors/spec";

const PROBE_EVERY_MS = 5 * 60_000;
const PROBE_STARTED = Symbol.for("winyu.connectorProbe.started");

type ProbeGlobal = typeof globalThis & { [PROBE_STARTED]?: ReturnType<typeof setInterval> };

async function checkStored(connector: StoredConnector): Promise<void> {
  const secret = openSecret(connector.id);
  if (!secret) return;
  await listUpstream(connector.id, { url: connector.url, auth: connector.auth.kind }, secret).catch(() => undefined);
}

/** Lists the tools of every activated console connector and keeps the listing; a tool whose description, schema or hints changed leaves the surface until the admin approves the change, a tool that returns to what was approved comes back, and the admin's status pill follows a server that stopped or came back. */
export async function reconcileConnectors(): Promise<void> {
  await Promise.all(storedConnectors().filter((connector) => connector.activatedAt !== null).map(checkStored));
}

/** Checks the connectors every few minutes, once per server process however many module copies load this file. */
export function startConnectorProbe(): void {
  const scope = globalThis as ProbeGlobal;
  if (scope[PROBE_STARTED]) return;
  scope[PROBE_STARTED] = setInterval(() => {
    reconcileConnectors().catch((error: unknown) => console.error("[Winyu] connector probe failed", error));
  }, PROBE_EVERY_MS);
}
