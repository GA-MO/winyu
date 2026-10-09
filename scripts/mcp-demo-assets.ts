import type { Employee } from "@/lib/contracts";
import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import { mcpEndpointFromEnv } from "@/lib/server/ports/mcp-port";
import type { DirectoryPort } from "@/lib/server/ports/directory";
import { mcpDemoFetch, portOf, type DemoMcpTool } from "./mcp-demo-server";

const SERVER_INFO = { name: "winyu-assets-demo", version: "0.1.0" };
const ASSETS_MCP_PORT = 3290;
const ASSET_KINDS = [
  { kind: "notebook", model: "ThinkPad T14 Gen 5", costThb: 42900 },
  { kind: "phone", model: "Galaxy A55", costThb: 13900 },
  { kind: "tablet", model: "iPad 10th gen", costThb: 15900 },
] as const;
const FIRST_ASSET_NO = 1001;
const FIRST_REQUEST_NO = 501;

/** Where Winyu reaches the demo asset system and the secret both sides sign identities with. */
export function assetsDemoEnv() {
  return mcpEndpointFromEnv("ASSETS", ASSETS_MCP_PORT);
}

type Asset = { asset_id: string; kind: string; model: string; serial_no: string; cost_thb: number; holder_id: string; region: string | null; status: "in_use" | "returned" };
type AssetRequest = { request_id: string; requester_id: string; kind: string; reason: string; status: "submitted"; created_at: string };

const object = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

function assetsOf(employees: readonly Employee[]): Asset[] {
  return employees.flatMap((employee, index) => {
    const owned = ASSET_KINDS.slice(0, 1 + (index % 2));
    return owned.map((item, slot) => {
      const no = FIRST_ASSET_NO + index * ASSET_KINDS.length + slot;
      return { asset_id: `AS-${no}`, kind: item.kind, model: item.model, serial_no: `SN${no}X${(index * 7919) % 10000}`, cost_thb: item.costThb, holder_id: employee.id, region: employee.region, status: "in_use" as const };
    });
  });
}

/** The demo asset register: what each person holds, requests for new equipment and returns. It keeps its records in memory, answers a repeated idempotency key with the first record, and acts only for the person whose identity Winyu signed. */
export function assetsDemoFetchFor(systems: { directory: DirectoryPort; secret: () => string }) {
  let assets: Asset[] | null = null;
  const requests: AssetRequest[] = [];
  const byKey = new Map<string, AssetRequest>();
  const loaded = async () => (assets ??= assetsOf((await systems.directory.load()).employees));

  const tools: DemoMcpTool[] = [
    {
      name: "list_assets",
      description: "Lists equipment in the register with its holder (holder_id is an employee id), serial number, cost and status.",
      inputSchema: object({}, []),
      annotations: { readOnlyHint: true },
      call: async () => ({ assets: await loaded(), as_of: new Date().toISOString() }),
    },
    {
      name: "list_asset_requests",
      description: "Lists requests for new equipment with who asked (requester_id) and their status.",
      inputSchema: object({}, []),
      annotations: { readOnlyHint: true },
      call: () => ({ requests }),
    },
    {
      name: "get_asset_request",
      description: "Reads one equipment request by its request_id.",
      inputSchema: object({ request_id: { type: "string" } }, ["request_id"]),
      annotations: { readOnlyHint: true },
      call: (args) => ({ requests: requests.filter((request) => request.request_id === args.request_id) }),
    },
    {
      name: "request_asset",
      description: "Files a request for new equipment for an employee. kind is notebook, phone or tablet. Returns the created request.",
      inputSchema: object(
        { requester_id: { type: "string" }, kind: { type: "string", enum: ASSET_KINDS.map((item) => item.kind) }, reason: { type: "string" }, idempotency_key: { type: "string" } },
        ["requester_id", "kind", "reason"],
      ),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      call: (args, identity) => {
        if (args.requester_id !== identity.userId) throw new Error("requester_id must be the signed caller");
        const key = typeof args.idempotency_key === "string" ? args.idempotency_key : null;
        const first = key ? byKey.get(key) : undefined;
        if (first) return first;
        const request: AssetRequest = { request_id: `AR-${FIRST_REQUEST_NO + requests.length}`, requester_id: String(args.requester_id), kind: String(args.kind), reason: String(args.reason ?? ""), status: "submitted", created_at: new Date().toISOString() };
        requests.push(request);
        if (key) byKey.set(key, request);
        return request;
      },
    },
    {
      name: "return_asset",
      description: "Returns a piece of equipment to IT and takes it off its holder. Cannot be undone from here.",
      inputSchema: object({ asset_id: { type: "string" }, idempotency_key: { type: "string" } }, ["asset_id"]),
      annotations: { readOnlyHint: false, destructiveHint: true },
      call: async (args) => {
        const asset = (await loaded()).find((item) => item.asset_id === args.asset_id);
        if (!asset) throw new Error(`no asset ${String(args.asset_id)}`);
        asset.status = "returned";
        return { asset_id: asset.asset_id, holder_id: asset.holder_id, status: asset.status };
      },
    },
  ];
  return mcpDemoFetch({ info: SERVER_INFO, secret: systems.secret, tools });
}

export const assetsDemoFetch = assetsDemoFetchFor({ directory: GENERATOR_PORTS.directory, secret: () => assetsDemoEnv().secret });

if (import.meta.main) {
  const server = Bun.serve({ port: portOf(assetsDemoEnv().url), hostname: "127.0.0.1", fetch: assetsDemoFetch });
  console.log(`Asset register demo MCP on ${server.url}mcp`);
}
