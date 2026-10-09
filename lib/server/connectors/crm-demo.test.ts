import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { crmDemoFetch } from "@/scripts/mcp-demo-crm";
import { forgetRemoteTools as resetCatalog } from "./catalog";
import { crmDemoConnector } from "./crm-demo";
import { CRM_DEMO_TOOL } from "./crm-demo-config";
import { CONNECTOR_FAILED, CONNECTOR_UNAVAILABLE, NONE_IN_SCOPE, PERMISSION_DENIED, type ConnectorToolResult } from "./call";
import { defineMcpConnector, registerConnectors, resetConnectors } from "./index";
import { openMcpClient, type McpTransportConfig } from "./mcp-client";
import { MASKED_VALUE, MAX_CONNECTOR_ROWS } from "./output";
import { registerClientFactory, resetClientPool } from "./pool";
import { IDENTITY_HEADERS } from "./signed-identity";

const TOOL = "crm_demo__store_visits";
const NATIVE_ID = "warehouse";
const SHORT_TIMEOUT_MS = 300;
const CEO_TOTAL_VISITS = 120;

type Seen = { user: string | null; args: Record<string, unknown> };

let seen: Seen[] = [];
let hang = false;
let forge = false;
let leak = false;

type JsonRpcBody = { method: string; params?: { arguments?: Record<string, unknown> } };

function withRegionsDropped(request: Request, body: JsonRpcBody): Request {
  const leaked = { ...body, params: { ...body.params, arguments: { ...body.params?.arguments, regions: null } } };
  return new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(leaked) });
}

async function recorded(request: Request): Promise<Response> {
  if (request.method !== "POST") return crmDemoFetch(request);
  const body = (await request.clone().json()) as JsonRpcBody;
  if (body.method !== "tools/call") return crmDemoFetch(request);
  seen.push({ user: request.headers.get(IDENTITY_HEADERS.user), args: body.params?.arguments ?? {} });
  if (hang) return new Promise<Response>(() => undefined);
  return crmDemoFetch(leak ? withRegionsDropped(request, body) : request);
}

const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: recorded });

function toTestServer(transport: McpTransportConfig): McpTransportConfig {
  if (transport.type !== "http") return transport;
  const headers = forge ? { ...transport.headers, [IDENTITY_HEADERS.user]: "u_thana" } : transport.headers;
  return { ...transport, url: `${server.url}mcp`, headers };
}

async function call(userId: string, input: Record<string, unknown>): Promise<ConnectorToolResult> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const tool = winyuTools()[TOOL];
  if (!tool) throw new Error(`no tool ${TOOL}`);
  return (await runWithAccess(liveAccessFor(user), () => tool.execute(tool.inputSchema().parse(input), { toolCallId: randomUUID() }))) as ConnectorToolResult;
}

function okRows(result: ConnectorToolResult) {
  if (!result.ok) throw new Error(`expected rows, got ${result.code}`);
  return result;
}

beforeEach(() => registerClientFactory((_connector, transport) => openMcpClient(toTestServer(transport), "winyu-test")));

afterEach(() => {
  seen = [];
  hang = false;
  forge = false;
  leak = false;
  resetConnectors();
  resetCatalog();
});

afterAll(() => {
  resetClientPool();
  server.stop(true);
});

describe("crm_demo over MCP", () => {
  test("a sales rep is asked for as themself, kept to their region whatever the model asks, with order value masked", async () => {
    const result = okRows(await call("u_krit", { agentId: null, regions: "north" }));
    expect(seen).toEqual([{ user: "u_krit", args: { agentId: null, regions: "northeast" } }]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.region === "northeast")).toBe(true);
    expect(result.rows.every((row) => row.order_value === MASKED_VALUE && row.order_value_label === MASKED_VALUE)).toBe(true);
    expect(result.provenance).toMatchObject({ sourceSystem: "CRM ภายนอกผ่าน MCP (เดโม)", masked: ["order_value"] });
  });

  test("an agent outside the rep's region comes back as none in scope, not as the other region's rows", async () => {
    const result = okRows(await call("u_krit", { agentId: "ag_nor_01", regions: null }));
    expect(result.code).toBe(NONE_IN_SCOPE);
    expect(result.rows).toEqual([]);
  });

  test("rows the server sends outside the caller's regions are filtered out after the call", async () => {
    leak = true;
    const result = await call("u_krit", { agentId: "ag_nor_01", regions: null });
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  test("a result the adapter cannot read fails in Winyu's words", async () => {
    const tool = crmDemoConnector.config.tools[CRM_DEMO_TOOL];
    if (!tool) throw new Error("no crm tool");
    registerConnectors([defineMcpConnector({ ...crmDemoConnector.config, tools: { [CRM_DEMO_TOOL]: { ...tool, output: () => { throw new Error("unexpected"); } } } })]);
    const result = await call("u_thana", { agentId: null, regions: null });
    expect(result).toMatchObject({ ok: false, code: CONNECTOR_FAILED });
  });

  test("the CEO sees every region, order values in full, capped rows and fenced server text", async () => {
    const result = okRows(await call("u_thana", { agentId: null, regions: null }));
    expect(seen[0]?.args).toEqual({ agentId: null, regions: null });
    expect(result.rows).toHaveLength(MAX_CONNECTOR_ROWS);
    expect(result.summary).toContain(String(CEO_TOTAL_VISITS));
    expect(result.provenance.masked).toEqual([]);
    expect(result.rows.some((row) => typeof row.order_value === "number" && row.order_value > 0)).toBe(true);
    expect(JSON.stringify(result.rows)).not.toContain("<system>");
  });

  test("a role the tool is not open to is denied before the server is asked", async () => {
    const result = await call("u_may", { agentId: null, regions: null });
    expect(result).toMatchObject({ ok: false, code: "TOOL_NOT_ALLOWED" });
    expect(seen).toEqual([]);
    expect(auditLog().all().at(-1)).toMatchObject({ tool: TOOL, decision: "deny" });
  });

  test("a forged identity is refused by the server and reads as unavailable", async () => {
    forge = true;
    const result = await call("u_krit", { agentId: null, regions: null });
    expect(result).toMatchObject({ ok: false, code: CONNECTOR_UNAVAILABLE });
    expect(seen).toEqual([]);
  });

  test("a server that does not answer in time reads as unavailable", async () => {
    registerConnectors([defineMcpConnector({ ...crmDemoConnector.config, timeoutMs: SHORT_TIMEOUT_MS })]);
    hang = true;
    const started = Date.now();
    const result = await call("u_anucha", { agentId: "ag_nea_01", regions: null });
    expect(result).toMatchObject({ ok: false, code: CONNECTOR_UNAVAILABLE });
    expect(Date.now() - started).toBeLessThan(SHORT_TIMEOUT_MS * 5);
  });
});

describe("defineMcpConnector", () => {
  const tool = crmDemoConnector.config.tools[CRM_DEMO_TOOL];
  if (!tool) throw new Error("no crm tool");

  test("puts each named remote tool on the surface under the connector's prefix, as an MCP connector", () => {
    expect(crmDemoConnector.def.kind).toBe("mcp");
    expect(crmDemoConnector.tools.map((winyuTool) => winyuTool.entry.name)).toEqual([TOOL]);
    expect(crmDemoConnector.fields.map((field) => field.key)).toEqual(["crm_demo.order_value"]);
  });

  test("refuses what a connector config must not leave open", () => {
    const config = crmDemoConnector.config;
    expect(() => defineMcpConnector({ ...config, id: NATIVE_ID })).toThrow("native connector");
    expect(() => defineMcpConnector({ ...config, tools: {} })).toThrow("opens no tools");
    expect(() => defineMcpConnector({ ...config, tools: { "a b": tool } })).toThrow("not a single remote tool");
    expect(() => defineMcpConnector({ ...config, tools: { [CRM_DEMO_TOOL]: { ...tool, scope: undefined as never } } })).toThrow("declares no scope");
    expect(() => defineMcpConnector({ ...config, tools: { [CRM_DEMO_TOOL]: { ...tool, scope: { kind: "none", reason: "" } } } })).toThrow("without a reason");
    expect(() => defineMcpConnector({ ...config, timeoutMs: 0 })).toThrow("timeoutMs");
  });
});
