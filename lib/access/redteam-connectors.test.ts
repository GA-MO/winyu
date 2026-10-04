import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { McpTransportConfig } from "@/lib/harness/adapters/vexa/server";
import type { AccessContext } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { ports } from "@/lib/server/ports";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { winyuTool, toolSurface } from "@/lib/server/tools/registry";
import { registerConnectors, resetConnectors } from "@/lib/server/connectors";
import { lmsDemoConnector } from "@/lib/server/connectors/lms-demo";
import { LMS_DEMO_ID, lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { registerClientFactory, resetClientPool, type ConnectorClient } from "@/lib/server/connectors/pool";
import { forgetRemoteTools } from "@/lib/server/connectors/catalog";
import { stubConnector } from "@/lib/server/connectors/stub";
import { lmsDemoFetch } from "@/scripts/mcp-demo-lms";
import { connectorEnabled, isToolAllowed, liveAccessFor, setConnectorEnabled, toolsFor, withAdminSwitches } from "./enforce";
import { setRoleTool } from "./role-overrides";

const ADMIN = "u_ton";
const TOOL = `${LMS_DEMO_ID}__training_history`;

type Result = { ok: boolean; code?: string; rows?: Record<string, unknown>[] };
type Seen = { args: Record<string, unknown>; user: string | null };

const seen: Seen[] = [];

function inProcessClient(transport: McpTransportConfig): ConnectorClient {
  const headers = transport.type === "http" ? (transport.headers ?? {}) : {};
  let id = 0;
  const rpc = async (method: string, params: Record<string, unknown>) => {
    id += 1;
    const request = new Request(lmsDemoEnv().url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    const body = (await (await lmsDemoFetch(request)).json()) as { result?: unknown; error?: { message: string } };
    if (body.error) throw new Error(body.error.message);
    return body.result;
  };
  return {
    callTool: async ({ name, arguments: args }) => {
      seen.push({ args: args ?? {}, user: headers["x-winyu-user"] ?? null });
      return rpc("tools/call", { name, arguments: args });
    },
    listTools: () => rpc("tools/list", {}),
    close: async () => undefined,
  } as ConnectorClient;
}

beforeAll(() => {
  registerConnectors([lmsDemoConnector, stubConnector()]);
  registerClientFactory(async (_connector, transport) => inProcessClient(transport));
});

afterAll(() => {
  resetConnectors();
  resetClientPool();
  forgetRemoteTools();
});

afterEach(() => {
  seen.splice(0);
  if (!connectorEnabled(LMS_DEMO_ID)) setConnectorEnabled(LMS_DEMO_ID, true, ADMIN);
});

function accessOf(id: string): AccessContext {
  const user = USERS.find((item) => item.id === id);
  if (!user) throw new Error(`no user ${id}`);
  return liveAccessFor(user);
}

async function ask(userId: string, input: Record<string, unknown>): Promise<Result> {
  const execute = winyuTool(TOOL)?.tool.execute as (input: unknown, options: unknown) => Promise<Result>;
  return runWithAccess(accessOf(userId), () => execute({ employeeId: null, name: null, regions: null, ...input }, {}));
}

function newAuditRows(before: Set<string>) {
  const rows = auditLog().all().filter((row) => !before.has(row.id));
  for (const row of rows) auditLog().remove(row.id);
  return rows;
}

describe("red team: connector scope", () => {
  test("a sales rep reads their own training and nobody else's", async () => {
    const own = await ask("u_krit", {});
    expect(own.ok).toBe(true);
    expect((own.rows ?? []).length).toBeGreaterThan(0);
    expect(new Set((own.rows ?? []).map((row) => row.employee_id))).toEqual(new Set(["u_krit"]));
  });

  test("no sales rep reads another employee's training, in or out of their region", async () => {
    const { employees } = await ports().directory.load();
    const reps = USERS.filter((user) => user.role === "sales_rep");
    const leaks: string[] = [];
    let probes = 0;
    for (const rep of reps) {
      for (const other of employees.filter((employee) => employee.id !== rep.id).slice(0, 40)) {
        probes += 1;
        const result = await ask(rep.id, { employeeId: other.id, regions: "all" });
        const foreign = (result.rows ?? []).filter((row) => row.employee_id !== rep.id);
        if (foreign.length > 0) leaks.push(`${rep.id} → ${other.id}`);
      }
    }
    expect(probes).toBeGreaterThan(60);
    expect(leaks).toEqual([]);
  });

  test("a region the model widens is rewritten before the server sees it", async () => {
    await ask("u_krit", { employeeId: "u_beam", regions: "all" });
    expect(seen.map((item) => [item.user, item.args.regions])).toEqual([["u_krit", "northeast"]]);
  });

  test("a peer inside the region is refused as out of scope and audited as deny", async () => {
    const before = new Set(auditLog().all().map((row) => row.id));
    const result = await ask("u_krit", { employeeId: "u_nok" });
    expect([result.ok, result.code]).toEqual([false, "PERMISSION_DENIED"]);
    expect(newAuditRows(before).map((row) => [row.tool, row.connector, row.decision])).toEqual([[TOOL, LMS_DEMO_ID, "deny"]]);
  });

  test("a manager sees the line's scores masked, HR sees them in full", async () => {
    const manager = await ask("u_anucha", { employeeId: "u_krit" });
    const hr = await ask(USERS.find((user) => user.role === "hr_manager")?.id ?? "", { employeeId: "u_krit" });
    const scored = (rows: Record<string, unknown>[] | undefined) => (rows ?? []).filter((row) => row.kind_label === "อบรม");
    expect(scored(manager.rows).length).toBeGreaterThan(0);
    expect(scored(manager.rows).every((row) => row.score === "***")).toBe(true);
    expect(scored(hr.rows).every((row) => typeof row.score === "number")).toBe(true);
  });

  test("the demo server refuses a caller whose identity Winyu did not sign", async () => {
    const response = await lmsDemoFetch(new Request(lmsDemoEnv().url, { method: "POST", headers: { "x-winyu-user": "u_ton", "x-winyu-role": "it_admin", "x-winyu-regions": "all" }, body: "{}" }));
    expect(response.status).toBe(401);
  });
});

describe("red team: connector surface", () => {
  test("a tool the server offers but the config does not name cannot be called", () => {
    expect(toolSurface().some((entry) => entry.name.includes("export_everything"))).toBe(false);
    expect(isToolAllowed(accessOf(ADMIN), "stub_lms__export_everything")).toBe(false);
  });

  test("switching the connector off takes the tool and its buttons away, and a stale call is refused", async () => {
    setConnectorEnabled(LMS_DEMO_ID, false, ADMIN);
    const access = accessOf("u_krit");
    expect(toolsFor(access)).not.toContain(TOOL);
    expect(withAdminSwitches(access).toolAllow).not.toContain(TOOL);
    const result = await ask("u_krit", {});
    expect([result.ok, result.code]).toEqual([false, "TOOL_NOT_ALLOWED"]);
    expect(seen).toEqual([]);
  });

  test("a tool the admin denies a role is refused with TOOL_NOT_ALLOWED and audited as deny", async () => {
    setRoleTool("sales_rep", TOOL, false, ADMIN);
    const before = new Set(auditLog().all().map((row) => row.id));
    const result = await ask("u_krit", {});
    setRoleTool("sales_rep", TOOL, true, ADMIN);
    expect([result.ok, result.code]).toEqual([false, "TOOL_NOT_ALLOWED"]);
    expect(newAuditRows(before).map((row) => row.decision)).toEqual(["deny"]);
    expect(seen).toEqual([]);
  });
});
