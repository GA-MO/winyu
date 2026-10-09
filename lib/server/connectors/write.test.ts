import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { liveAccessFor, SWITCHES_COLLECTION } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import type { User } from "@/lib/contracts";
import { asksApproval } from "@/lib/harness/gateway";
import { TH } from "@/lib/i18n/th";
import { winyuTools } from "@/lib/server/agent/tools";
import { auditLog } from "@/lib/server/audit";
import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import { runWithAccess } from "@/lib/server/request-context";
import { collection } from "@/lib/server/store/json-store";
import { type ConnectorView, type ToolDraft, type WriteDraft } from "@/lib/connectors/spec";
import { assetsDemoFetchFor } from "@/scripts/mcp-demo-assets";
import { resetClientPool } from "./pool";
import { CONNECTOR_HOSTS_ENV } from "./egress";
import { CONNECTOR_KEY_ENV, CONNECTOR_SECRETS_COLLECTION } from "./secrets";
import { CONNECTORS_COLLECTION, UPSTREAM_COLLECTION } from "./stored";
import { activateConnector, discoverConnector, saveConnectorTools, testConnectorTool } from "./admin";

const SECRET = "asset-register-test-secret";
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: assetsDemoFetchFor({ directory: GENERATOR_PORTS.directory, secret: () => SECRET }) });
const URL_OF_SERVER = `${server.url}mcp`;
const ID = `asset_${randomUUID().slice(0, 6)}`;
const READ_ROLES = ["sales_rep", "sales_rsm", "ceo"] as const;
const previousEnv = { key: process.env[CONNECTOR_KEY_ENV], hosts: process.env[CONNECTOR_HOSTS_ENV] };

type Result = { ok: boolean; code?: string; rows?: Record<string, unknown>[]; error?: string };

function userOf(id: string): User {
  const user = findUser(id);
  if (!user) throw new Error(`no user ${id}`);
  return user;
}

const ADMIN = userOf("u_ton");

function readDraft(name: string, field: string): ToolDraft {
  return { name, labelTh: `อ่าน ${name}`, description: `Reads ${name}.`, tier: "read", roles: [...READ_ROLES], scope: { kind: "scoped", filter: { kind: "own_rows", field, key: "employee_id" }, inject: null }, sensitive: [], write: null };
}

function writeDraft(name: string, tier: "write" | "destructive", write: WriteDraft): ToolDraft {
  return { name, labelTh: name === "request_asset" ? "ขอเบิกทรัพย์สิน" : "คืนทรัพย์สิน", description: `Does ${name}.`, tier, roles: [...READ_ROLES], scope: { kind: "unset" }, sensitive: [], write };
}

const DRAFTS: ToolDraft[] = [
  readDraft("list_assets", "holder_id"),
  readDraft("get_asset_request", "requester_id"),
  writeDraft("request_asset", "write", {
    pins: [{ kind: "identity", arg: "requester_id", key: "employee_id" }, { kind: "call_id", arg: "idempotency_key" }],
    guards: [],
    redact: ["reason"],
    verify: { kind: "read_back", tool: "get_asset_request", idArg: "request_id", idField: "request_id", fields: ["requester_id", "kind"] },
    duplicateRisk: false,
  }),
  writeDraft("return_asset", "destructive", {
    pins: [{ kind: "call_id", arg: "idempotency_key" }],
    guards: [{ arg: "asset_id", tool: "list_assets", field: "asset_id" }],
    redact: [],
    verify: { kind: "echo", idField: "asset_id", fields: ["asset_id"] },
    duplicateRisk: false,
  }),
];

function hashOf(view: ConnectorView, name: string): string {
  return view.upstream?.tools.find((tool) => tool.name === name)?.hash ?? "";
}

async function call(userId: string, remote: string, input: Record<string, unknown>, toolCallId = randomUUID()): Promise<Result> {
  const tool = winyuTools()[`${ID}__${remote}`];
  if (!tool) throw new Error(`${remote} is not live`);
  return (await runWithAccess(liveAccessFor(userOf(userId)), () => tool.execute(tool.inputSchema().parse(input), { toolCallId }))) as Result;
}

async function asks(userId: string, remote: string, input: Record<string, unknown>): Promise<boolean> {
  const tool = winyuTools()[`${ID}__${remote}`];
  if (!tool) throw new Error(`${remote} is not live`);
  return runWithAccess(liveAccessFor(userOf(userId)), () => asksApproval(tool.capability, input));
}

async function assetsOf(userId: string): Promise<string[]> {
  const result = await call(userId, "list_assets", {});
  return (result.rows ?? []).map((row) => String(row.asset_id));
}

beforeAll(async () => {
  process.env[CONNECTOR_KEY_ENV] = randomBytes(32).toString("base64");
  process.env[CONNECTOR_HOSTS_ENV] = "127.0.0.1";
  const discovered = await discoverConnector(ADMIN, { existing: false, id: ID, labelTh: "ระบบทรัพย์สิน", url: URL_OF_SERVER, auth: "signed_identity", secret: SECRET });
  if (!discovered.ok) throw new Error(`discover: ${discovered.problem} ${discovered.detail ?? ""}`);
  const saved = saveConnectorTools(ADMIN, { connector: ID, tools: DRAFTS.map((draft) => ({ draft, fields: [], seenHash: hashOf(discovered.view, draft.name) })), removed: [] });
  if (!saved.ok) throw new Error(`save: ${saved.problem}`);
  expect(saved.incomplete).toEqual({});
  for (const draft of DRAFTS) {
    const tested = await testConnectorTool(ADMIN, { connector: ID, tool: draft.name, asUser: "u_krit" });
    if (!tested.ok) throw new Error(`test ${draft.name}: ${tested.problem}`);
  }
  const activated = activateConnector(ADMIN, { connector: ID });
  if (!activated.ok) throw new Error(`activate: ${activated.problem} ${(activated.codes ?? []).join(",")}`);
});

afterAll(() => {
  for (const name of [CONNECTORS_COLLECTION, UPSTREAM_COLLECTION, CONNECTOR_SECRETS_COLLECTION]) collection(name).remove(ID);
  collection(SWITCHES_COLLECTION).remove(`connector:${ID}`);
  process.env[CONNECTOR_KEY_ENV] = previousEnv.key;
  process.env[CONNECTOR_HOSTS_ENV] = previousEnv.hosts;
  resetClientPool();
  server.stop(true);
});

describe("a write tool from the console", () => {
  test("its test never sends the write: the dry run resolves the pins and reads the guard's tool as the person", async () => {
    const tested = await testConnectorTool(ADMIN, { connector: ID, tool: "return_asset", asUser: "u_krit" });
    if (!tested.ok) throw new Error(tested.problem);
    expect(tested.run).toMatchObject({ dryRun: true, missingField: 0 });
    expect(tested.run.received).toBeGreaterThan(tested.run.kept);
    expect(tested.run.kept).toBeGreaterThan(0);
  });

  test("the requester is pinned to the caller whatever the model sent, the reason never reaches the audit, and the record reads back", async () => {
    expect(await asks("u_krit", "request_asset", { requester_id: "u_somchai", kind: "notebook", reason: "เครื่องเดิมเปิดไม่ติด" })).toBe(true);
    const before = auditLog().all().length;
    const result = await call("u_krit", "request_asset", { requester_id: "u_somchai", kind: "notebook", reason: "เครื่องเดิมเปิดไม่ติด" });
    expect(result.ok).toBe(true);
    expect(result.rows?.[0]).toMatchObject({ requester_id: "u_krit", kind: "notebook" });
    const row = auditLog().all().slice(before).find((entry) => entry.tool === `${ID}__request_asset`);
    expect(row?.args).toContain(TH.admin.auditTab.redacted);
    expect(row?.args).not.toContain("เปิดไม่ติด");
  });

  test("the same call id files one request, however often it is sent", async () => {
    const toolCallId = randomUUID();
    const first = await call("u_krit", "request_asset", { requester_id: "u_krit", kind: "phone", reason: "โทรศัพท์หาย" }, toolCallId);
    const again = await call("u_krit", "request_asset", { requester_id: "u_krit", kind: "phone", reason: "โทรศัพท์หาย" }, toolCallId);
    expect(first.rows?.[0]?.request_id).toBeDefined();
    expect(again.rows?.[0]?.request_id).toBe(first.rows?.[0]?.request_id);
  });

  test("a return of someone else's asset is refused before the approval card and nothing is sent; one's own goes through", async () => {
    const mine = await assetsOf("u_krit");
    const theirs = (await assetsOf("u_thana")).find((asset) => !mine.includes(asset));
    if (!theirs || !mine[0]) throw new Error("expected assets");
    expect(await asks("u_krit", "return_asset", { asset_id: theirs })).toBe(false);
    const refused = await call("u_krit", "return_asset", { asset_id: theirs });
    expect(refused).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
    expect(await assetsOf("u_thana")).toContain(theirs);
    expect(await asks("u_krit", "return_asset", { asset_id: mine[0] })).toBe(true);
    const returned = await call("u_krit", "return_asset", { asset_id: mine[0] });
    expect(returned.rows?.[0]).toMatchObject({ asset_id: mine[0], status: "returned" });
  });

});
