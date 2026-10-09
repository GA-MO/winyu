import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";

export const CONNECTOR_HOSTS_ENV = "WINYU_CONNECTOR_HOSTS";
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const PROTOCOLS = new Set(["http:", "https:"]);
const DEFAULT_PORT: Record<string, string> = { "http:": "80", "https:": "443" };
const ENTRY_SEPARATOR = /[\s,]+/;

const ALWAYS_REFUSED: readonly [string, number, "ipv4" | "ipv6"][] = [
  ["0.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["100.100.100.200", 32, "ipv4"],
  ["224.0.0.0", 4, "ipv4"],
  ["255.255.255.255", 32, "ipv4"],
  ["::", 128, "ipv6"],
  ["fe80::", 10, "ipv6"],
  ["fd00:ec2::254", 128, "ipv6"],
  ["ff00::", 8, "ipv6"],
];

const PRIVATE: readonly [string, number, "ipv4" | "ipv6"][] = [
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["::1", 128, "ipv6"],
  ["fc00::", 7, "ipv6"],
];

/** Why Winyu will not connect to a URL. */
export type EgressProblem = "bad_url" | "credentials_in_url" | "host_not_allowed" | "address_refused" | "unresolvable";

export class EgressRefused extends Error {
  readonly problem: EgressProblem;
  constructor(problem: EgressProblem) {
    super(`connector egress refused: ${problem}`);
    this.name = "EgressRefused";
    this.problem = problem;
  }
}

/** The hosts Winyu may connect to, from the server's own setting: names (optionally with a port), IP addresses and CIDR ranges. */
export type Allowlist = { entries: string[]; names: ReadonlySet<string>; addresses: BlockList };

export type Resolver = (host: string) => Promise<string[]>;

function blockListOf(ranges: readonly [string, number, "ipv4" | "ipv6"][]): BlockList {
  const list = new BlockList();
  for (const [address, prefix, family] of ranges) list.addSubnet(address, prefix, family);
  return list;
}

const REFUSED = blockListOf(ALWAYS_REFUSED);
const PRIVATE_RANGES = blockListOf(PRIVATE);

function familyOf(address: string): "ipv4" | "ipv6" {
  return isIP(address) === 6 ? "ipv6" : "ipv4";
}

function addEntry(entry: string, names: Set<string>, addresses: BlockList): void {
  const [address, prefix] = entry.split("/");
  if (prefix !== undefined && address && isIP(address)) {
    addresses.addSubnet(address, Number(prefix), familyOf(address));
    return;
  }
  if (isIP(entry)) addresses.addAddress(entry, familyOf(entry));
  names.add(entry);
}

/** Parses the allowlist setting; an unset setting allows nothing. */
export function egressAllowlist(raw: string = process.env[CONNECTOR_HOSTS_ENV] ?? ""): Allowlist {
  const entries = raw.split(ENTRY_SEPARATOR).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const names = new Set<string>();
  const addresses = new BlockList();
  for (const entry of entries) addEntry(entry, names, addresses);
  return { entries, names, addresses };
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function hostAllowed(url: URL, allowlist: Allowlist): boolean {
  const host = hostOf(url);
  const port = url.port || DEFAULT_PORT[url.protocol] || "";
  if (allowlist.names.has(host) || allowlist.names.has(`${host}:${port}`)) return true;
  return isIP(host) !== 0 && allowlist.addresses.check(host, familyOf(host));
}

function addressRefused(address: string, allowlist: Allowlist): boolean {
  const family = familyOf(address);
  if (REFUSED.check(address, family)) return true;
  return PRIVATE_RANGES.check(address, family) && !allowlist.addresses.check(address, family);
}

const systemResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);

async function addressesOf(host: string, resolve: Resolver): Promise<string[] | null> {
  if (isIP(host)) return [host];
  try {
    const addresses = await resolve(host);
    return addresses.length > 0 ? addresses : null;
  } catch {
    return null;
  }
}

/** Why a connection to this URL is refused, or null when it may go: http(s) only, no credentials in the URL, a host on the allowlist, and no resolved address that is cloud metadata, link-local, or private without being on the list itself. */
export async function egressProblem(raw: string, options: { allowlist?: Allowlist; resolve?: Resolver } = {}): Promise<EgressProblem | null> {
  const allowlist = options.allowlist ?? egressAllowlist();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "bad_url";
  }
  if (!PROTOCOLS.has(url.protocol)) return "bad_url";
  if (url.username || url.password) return "credentials_in_url";
  if (!hostAllowed(url, allowlist)) return "host_not_allowed";
  const addresses = await addressesOf(hostOf(url), options.resolve ?? systemResolver);
  if (!addresses) return "unresolvable";
  return addresses.some((address) => addressRefused(address, allowlist)) ? "address_refused" : null;
}

function cappedBody(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > MAX_RESPONSE_BYTES) controller.error(new Error(`connector response over ${MAX_RESPONSE_BYTES} bytes`));
        else controller.enqueue(chunk);
      },
    }),
  );
}

function capped(response: Response): Response {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) throw new Error(`connector response over ${MAX_RESPONSE_BYTES} bytes`);
  if (!response.body) return response;
  return new Response(cappedBody(response.body), { status: response.status, statusText: response.statusText, headers: response.headers });
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

async function checkedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const problem = await egressProblem(urlOf(input));
  if (problem) throw new EgressRefused(problem);
  return capped(await fetch(input, { ...init, redirect: "error" }));
}

/** The fetch every connector made in the admin console uses: each request checked against the allowlist, redirects refused, the reply capped in size. */
export const egressFetch: typeof fetch = Object.assign(checkedFetch, { preconnect: fetch.preconnect });
