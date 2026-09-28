import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { AccessContext, RoleId } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { connectorEnabled, liveAccessFor, setConnectorEnabled, toolsFor } from "@/lib/access/enforce";
import { fieldVisibilityOf, setFieldVisibility } from "@/lib/access/role-overrides";
import { auditLog, withAudit } from "@/lib/server/audit";
import { runWithAccess } from "@/lib/server/request-context";
import { applyPermissionChange } from "@/lib/server/permissions";
import { connectors, winyuTool, toolSurface } from "@/lib/server/tools/registry";
import { callConnectorTool, CONNECTOR_UNAVAILABLE, NONE_IN_SCOPE, SCOPE_TRIMMED } from "./call";
import { forgetRemoteTools } from "./catalog";
import { defineMcpConnector, registerConnectors, resetConnectors } from "./index";
import { MASKED_VALUE } from "./output";
import { registerClientFactory, resetClientPool } from "./pool";
import { probeConnectors, reconcileConnectors } from "./reconcile";
import { connectorHealth } from "./catalog";
import { STUB_CONNECTOR_ID, STUB_INJECTED_TEXT, stubConnector, stubServer, type StubServer } from "./stub";
import type { ConnectorRow, ConnectorToolBinding, McpConnectorConfig, McpToolConfig } from "./types";

const ADMIN = "u_ton";
const HISTORY = `${STUB_CONNECTOR_ID}__training_history`;
const WIPE = `${STUB_CONNECTOR_ID}__wipe_records`;

type Rows = { ok: true; rows: Record<string, unknown>[]; provenance: { masked: string[] } };

let server: StubServer;

beforeAll(() => registerConnectors([stubConnector()]));
afterAll(() => {
  resetConnectors();
  resetClientPool();
  forgetRemoteTools();
});

afterEach(() => {
  resetClientPool();
  forgetRemoteTools();
  if (!connectorEnabled(STUB_CONNECTOR_ID)) setConnectorEnabled(STUB_CONNECTOR_ID, true, ADMIN);
});

function fresh(): StubServer {
  server = stubServer();
  registerClientFactory(server.factory);
  return server;
}

function userId(role: RoleId): string {
  const user = USERS.find((item) => item.role === role);
  if (!user) throw new Error(`no user in role ${role}`);
  return user.id;
}

function accessOf(id: string): AccessContext {
  const user = USERS.find((item) => item.id === id);
  if (!user) throw new Error(`no user ${id}`);
  return liveAccessFor(user);
}

async function call(name: string, access: AccessContext, input: unknown): Promise<unknown> {
  const execute = winyuTool(name)?.tool.execute as (input: unknown, options: unknown) => Promise<unknown>;
  return runWithAccess(access, () => execute(input, {}));
}

function newAuditRows(before: Set<string>) {
  const rows = auditLog().all().filter((row) => !before.has(row.id));
  for (const row of rows) auditLog().remove(row.id);
  return rows;
}

function config(tools: Record<string, McpToolConfig>): McpConnectorConfig {
  return { id: "broken", labelTh: "x", sourceSystemTh: "x", transport: { type: "http", url: "http://127.0.0.1:1" }, auth: () => ({}), timeoutMs: 100, tools };
}

describe("declaring a connector", () => {
  test("a tool without scope or roles cannot be built", () => {
    const base = { labelTh: "x", roles: "all", scope: { kind: "none", reason: "x" } } as const;
    expect(() => defineMcpConnector(config({ a: { ...base, scope: undefined } as unknown as McpToolConfig }))).toThrow("declares no scope");
    expect(() => defineMcpConnector(config({ a: { ...base, roles: undefined } as unknown as McpToolConfig }))).toThrow("declares no roles");
    expect(() => defineMcpConnector(config({ a: { ...base, scope: [] as unknown as McpToolConfig["scope"] } }))).toThrow("empty scope");
    expect(() => defineMcpConnector(config({ "*": base }))).toThrow("not a single remote tool");
    expect(() => defineMcpConnector({ ...config({ a: base }), id: "hris" })).toThrow("native connector");
  });

  test("its tools join the one surface under its connector, and a tool left undeclared never does", () => {
    const names = toolSurface().filter((entry) => entry.connector === STUB_CONNECTOR_ID).map((entry) => [entry.name, entry.tier]);
    expect(names).toEqual([[HISTORY, "read"], [WIPE, "destructive"]]);
    expect(toolSurface().some((entry) => entry.name.includes("export_everything"))).toBe(false);
    expect(winyuTool(WIPE)?.tool.needsApproval).toBe(true);
    expect(connectors().map((item) => [item.id, item.kind]).at(-1)).toEqual([STUB_CONNECTOR_ID, "mcp"]);
  });

  test("roles come from the config: only it_admin gets the tool that declares it", () => {
    for (const role of ["sales_rep", "ceo", "it_admin"] as const) {
      const tools = toolsFor(accessOf(userId(role)));
      expect({ role, history: tools.includes(HISTORY), wipe: tools.includes(WIPE) }).toEqual({ role, history: true, wipe: role === "it_admin" });
    }
  });
});

describe("calling a connector tool", () => {
  test("the server hears who is asking, and the model cannot widen the region", async () => {
    fresh();
    const result = (await call(HISTORY, accessOf("u_krit"), { employeeId: null, region: "bkk" })) as Rows;
    expect(server.calls[0].headers["x-winyu-user"]).toBe("u_krit");
    expect(server.calls[0].args.region).toBe("northeast");
    expect(result.rows.every((row) => row.region === "northeast")).toBe(true);
  });

  test("rows outside the caller's scope are dropped even when the server ignores the argument", async () => {
    fresh().ignoresRegion = true;
    const result = (await call(HISTORY, accessOf("u_krit"), { employeeId: null, region: null })) as Rows;
    expect(result.rows.map((row) => row.region)).toEqual(["northeast"]);
  });

  test("each user gets a client of their own", async () => {
    fresh();
    await call(HISTORY, accessOf("u_krit"), { employeeId: null, region: null });
    await call(HISTORY, accessOf(userId("ceo")), { employeeId: null, region: null });
    expect(server.calls.map((item) => item.headers["x-winyu-user"])).toEqual(["u_krit", userId("ceo")]);
  });

  test("a sensitive field is full, masked or gone by role, and the audit says masked", async () => {
    fresh();
    const before = new Set(auditLog().all().map((row) => row.id));
    const ceo = (await call(HISTORY, accessOf(userId("ceo")), { employeeId: null, region: null })) as Rows;
    const rsm = (await call(HISTORY, accessOf("u_anucha"), { employeeId: null, region: null })) as Rows;
    const rep = (await call(HISTORY, accessOf("u_krit"), { employeeId: null, region: null })) as Rows;
    expect(ceo.rows[0].score).toBe(92);
    expect([rsm.rows[0].score, rsm.rows[0].score_label]).toEqual([MASKED_VALUE, MASKED_VALUE]);
    expect("score" in rep.rows[0]).toBe(false);
    expect([ceo.provenance.masked, rsm.provenance.masked]).toEqual([[], ["score"]]);
    const audit = newAuditRows(before);
    expect(audit.map((row) => [row.tool, row.connector, row.decision])).toEqual([
      [HISTORY, STUB_CONNECTOR_ID, "allow"],
      [HISTORY, STUB_CONNECTOR_ID, "masked"],
      [HISTORY, STUB_CONNECTOR_ID, "masked"],
    ]);
  });

  test("an admin override on a field wins over the connector default", async () => {
    fresh();
    const key = `${STUB_CONNECTOR_ID}.score`;
    setFieldVisibility("sales_rep", key, "full", ADMIN);
    expect(fieldVisibilityOf("sales_rep", key)).toBe("full");
    const rep = (await call(HISTORY, accessOf("u_krit"), { employeeId: null, region: null })) as Rows;
    expect(rep.rows[0].score).toBe(71);
    setFieldVisibility("sales_rep", key, "none", ADMIN);
    expect(fieldVisibilityOf("sales_rep", key)).toBe("none");
  });

  test("text from the server is fenced, in rows and in the description", async () => {
    fresh();
    const result = (await call(HISTORY, accessOf(userId("ceo")), { employeeId: null, region: null })) as Rows;
    await reconcileConnectors();
    const description = winyuTool(HISTORY)?.tool.description ?? "";
    expect(description).toContain(STUB_INJECTED_TEXT);
    expect(description).not.toContain("<system>");
    expect(result.rows.some((row) => String(row.course).includes(STUB_INJECTED_TEXT))).toBe(true);
  });

  test("a server that does not answer gives CONNECTOR_UNAVAILABLE and still leaves an audit row", async () => {
    fresh().offline = true;
    const before = new Set(auditLog().all().map((row) => row.id));
    const result = (await call(HISTORY, accessOf("u_krit"), { employeeId: null, region: null })) as { ok: boolean; code: string; error: string };
    expect([result.ok, result.code]).toEqual([false, CONNECTOR_UNAVAILABLE]);
    expect(result.error).toContain("ระบบอบรมทดสอบ");
    expect(newAuditRows(before).map((row) => [row.tool, row.connector])).toEqual([[HISTORY, STUB_CONNECTOR_ID]]);
  });

  test("inputs are checked by Winyu's schema before anything reaches the server", async () => {
    fresh();
    const before = new Set(auditLog().all().map((row) => row.id));
    await expect(call(HISTORY, accessOf("u_krit"), { employeeId: 7, region: null })).rejects.toThrow();
    expect(server.calls).toEqual([]);
    expect(newAuditRows(before).map((row) => row.decision)).toEqual(["deny"]);
  });
});

describe("switching a connector off", () => {
  test("takes every one of its tools away from every role, and on again brings them back", () => {
    setConnectorEnabled(STUB_CONNECTOR_ID, false, ADMIN);
    for (const role of ["sales_rep", "it_admin"] as const) {
      const access = accessOf(userId(role));
      expect(toolsFor(access).filter((name) => name.startsWith(STUB_CONNECTOR_ID))).toEqual([]);
      expect(access.toolAllow.some((name) => name.startsWith(STUB_CONNECTOR_ID))).toBe(false);
      expect(toolsFor(access)).toContain("query_metric");
    }
    setConnectorEnabled(STUB_CONNECTOR_ID, true, ADMIN);
    expect(toolsFor(accessOf(userId("it_admin")))).toContain(WIPE);
  });

  test("a native connector switches off the same way", () => {
    setConnectorEnabled("lms", false, ADMIN);
    const tools = toolsFor(accessOf("u_krit"));
    setConnectorEnabled("lms", true, ADMIN);
    expect(tools.filter((name) => name === "list_courses" || name === "enroll_course")).toEqual([]);
    expect(tools).toContain("find_people");
  });
});

describe("changing a connector's permissions from chat", () => {
  test("set_permission moves a connector field and takes a connector tool away", () => {
    const key = `${STUB_CONNECTOR_ID}.score`;
    const field = applyPermissionChange({ role: "sales_rsm", kind: "field", key, value: "full" }, ADMIN);
    expect(field.ok && [field.data.label, field.data.before, field.data.after]).toEqual(["คะแนนสอบ", "Masked", "Full"]);
    expect(fieldVisibilityOf("sales_rsm", key)).toBe("full");
    applyPermissionChange({ role: "sales_rsm", kind: "field", key, value: "masked" }, ADMIN);
    expect(applyPermissionChange({ role: "sales_rsm", kind: "field", key: "stub_lms.salary", value: "full" }, ADMIN).ok).toBe(false);
    const tool = applyPermissionChange({ role: "sales_rep", kind: "tool", key: HISTORY, value: "deny" }, ADMIN);
    expect(tool.ok).toBe(true);
    expect(toolsFor(accessOf("u_krit"))).not.toContain(HISTORY);
    applyPermissionChange({ role: "sales_rep", kind: "tool", key: HISTORY, value: "allow" }, ADMIN);
    expect(toolsFor(accessOf("u_krit"))).toContain(HISTORY);
  });
});

describe("connector health", () => {
  test("a probe marks a server online, and offline once it stops answering", async () => {
    const server = fresh();
    await probeConnectors();
    expect(connectorHealth(STUB_CONNECTOR_ID)).toBe("online");
    registerClientFactory(async () => {
      throw new Error("down");
    });
    await probeConnectors();
    expect(connectorHealth(STUB_CONNECTOR_ID)).toBe("offline");
    expect(server.calls).toEqual([]);
  });
});

describe("reconciling with the server", () => {
  test("reports declared tools the server lacks and server tools Winyu leaves closed", async () => {
    fresh();
    const [drift] = await reconcileConnectors();
    expect(drift).toEqual({ connector: STUB_CONNECTOR_ID, missing: [], unused: ["export_everything"], mismatched: [] });
  });
});

describe("what a scoped result tells the model and the audit", () => {
  const OWN_REGION = "northeast";
  const binding: ConnectorToolBinding = {
    name: HISTORY,
    remoteName: "training_history",
    tier: "read",
    fields: [],
    config: { labelTh: "ประวัติอบรม", roles: "all", scope: [{ kind: "filter", rows: (rows) => rows.filter((row) => row.region === OWN_REGION) }] },
  };
  const IDENTITY = { id: STUB_CONNECTOR_ID, labelTh: "LMS", sourceSystemTh: "LMS" };

  function rowsIn(region: string, count: number): ConnectorRow[] {
    return Array.from({ length: count }, (_, index) => ({ id: `${region}_${index}`, region }));
  }

  async function answer(rows: ConnectorRow[], summary?: string) {
    const before = new Set(auditLog().all().map((row) => row.id));
    const audited = withAudit(HISTORY, STUB_CONNECTOR_ID, (input: unknown) => callConnectorTool(IDENTITY, binding, input, async () => ({ ok: true, output: { rows, summary } })));
    const result = await runWithAccess(accessOf("u_krit"), () => audited({}));
    return { result, audit: newAuditRows(before) };
  }

  test("rows the scope removed are flagged, and the server's own count is not repeated", async () => {
    const { result } = await answer([...rowsIn(OWN_REGION, 3), ...rowsIn("bkk", 5)], "8 แถว");
    if (!result.ok) throw new Error("expected rows");
    expect(result.code).toBe(SCOPE_TRIMMED);
    expect(result.summary).toBe("ประวัติอบรม 3 แถว");
  });

  test("the audit keeps the scope code on an allowed call", async () => {
    const { audit } = await answer([...rowsIn(OWN_REGION, 1), ...rowsIn("bkk", 1)]);
    expect(audit.map((row) => [row.decision, row.code, row.rowsReturned])).toEqual([["allow", SCOPE_TRIMMED, 1]]);
  });

  test("an empty answer inside the scope says so", async () => {
    const { result } = await answer([]);
    if (!result.ok) throw new Error("expected an empty answer");
    expect(result.code).toBe(NONE_IN_SCOPE);
  });

  test("more rows than the model receives are counted as shown of total", async () => {
    const { result } = await answer(rowsIn(OWN_REGION, 120));
    if (!result.ok) throw new Error("expected rows");
    expect(result.rows).toHaveLength(60);
    expect(result.summary).toBe("ประวัติอบรม 60 จาก 120 แถว");
    expect(result.code).toBeUndefined();
  });
});
