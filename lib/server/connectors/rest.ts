import { fence } from "@/lib/harness/fence";
import type { AccessContext } from "@/lib/contracts";
import { markReachable } from "./catalog";
import { withinTimeout } from "./call";
import type { ConnectorToolBinding, RemoteCaller, RemoteOutcome, RestConnectorConfig, RestToolConfig } from "./types";

/** Sends one HTTP request; tests swap it for an in-process server. */
export type RestTransport = (request: Request) => Promise<Response>;

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const MAX_ERROR_TEXT = 400;
const GATEWAY_DOWN: ReadonlySet<number> = new Set([502, 503, 504]);

const sendOverNetwork: RestTransport = (request) => fetch(request);

let transport: RestTransport = sendOverNetwork;

/** The argument names a path fills in, in order. */
export function placeholdersOf(path: string): string[] {
  return [...path.matchAll(PLACEHOLDER)].map((match) => match[1] as string);
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function urlOf(connector: RestConnectorConfig, tool: RestToolConfig, args: Record<string, unknown>): URL {
  const path = tool.path.replace(PLACEHOLDER, (_match, name: string) => encodeURIComponent(String(args[name] ?? "")));
  return new URL(`${connector.baseUrl.replace(/\/+$/, "")}${path}`);
}

/** The request for one call: path placeholders filled and encoded, the other arguments as the query (GET) or the JSON body (POST), the caller's identity from `auth`, and no redirects so those headers never follow the request elsewhere. */
export function restRequestOf(connector: RestConnectorConfig, tool: RestToolConfig, args: Record<string, unknown>, access: AccessContext | null): Request {
  const url = urlOf(connector, tool, args);
  const inPath = new Set(placeholdersOf(tool.path));
  const rest = Object.entries(args).filter(([name, value]) => !inPath.has(name) && present(value));
  const init = { headers: { accept: "application/json", ...connector.auth(access) }, redirect: "error" as const, signal: AbortSignal.timeout(connector.timeoutMs) };
  if (tool.method === "GET") {
    for (const [name, value] of rest) url.searchParams.set(name, String(value));
    return new Request(url, { ...init, method: "GET" });
  }
  return new Request(url, { ...init, method: "POST", headers: { ...init.headers, "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(rest)) });
}

async function failureOf(response: Response): Promise<RemoteOutcome> {
  if (GATEWAY_DOWN.has(response.status)) return { ok: false, reason: "unavailable" };
  const text = await response.text().catch(() => "");
  return { ok: false, reason: "failed", text: fence(`HTTP ${response.status} ${text.slice(0, MAX_ERROR_TEXT)}`) };
}

async function outputOf(tool: RestToolConfig, response: Response): Promise<RemoteOutcome> {
  try {
    return { ok: true, output: tool.output(await response.json()) };
  } catch {
    return { ok: false, reason: "failed", text: "response is not what the adapter expects" };
  }
}

/** How a REST endpoint is asked: one request as the person asking, 502–504 and timeouts as unavailable, other errors in the server's own (fenced) words, the body through Winyu's adapter. */
export function restCaller(connector: RestConnectorConfig, binding: ConnectorToolBinding<RestToolConfig>): RemoteCaller {
  return async (args, access) => {
    let response: Response;
    try {
      response = await withinTimeout(transport(restRequestOf(connector, binding.config, args, access)), connector.timeoutMs);
    } catch {
      markReachable(connector.id, false);
      return { ok: false, reason: "unavailable" };
    }
    markReachable(connector.id, !GATEWAY_DOWN.has(response.status));
    if (!response.ok) return failureOf(response);
    return outputOf(binding.config, response);
  };
}

export function registerRestTransport(next: RestTransport): void {
  transport = next;
}

export function resetRestTransport(): void {
  transport = sendOverNetwork;
}
