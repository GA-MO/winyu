import { afterEach, describe, expect, test } from "bun:test";
import { Client, StreamableHTTPClientTransport, type VersionNegotiationMode } from "@modelcontextprotocol/client";
import { killTool, reviveTool } from "@/lib/access/enforce";
import { addRule, policyRules, removeRule } from "@/lib/access/policy-rules";
import { overrideFor, removeOverride, setRoleTool } from "@/lib/access/role-overrides";
import { runStore } from "@/lib/harness/runtime";
import { auditLog } from "./audit";
import { handleMcpRequest } from "./mcp";
import { ACCESS_TOKENS_COLLECTION, issueToken, accessTokens, revokeToken } from "./access-tokens";
import { collection } from "./store/json-store";

const ADMIN = "u_ton";
const CEO = "u_thana";
const SALES_REP = "u_krit";
const ENDPOINT = "http://localhost/api/mcp";
const NORTHEAST = "ภาคอีสาน";
const BY_REGION = { metric: "net_sales_volume", dims: ["region"], filters: {}, range: { from: "2026-07-01", to: "2026-09-30" }, grain: "month", compare: "none", limit: 10 };

const cleanups: (() => void)[] = [];
const auditBefore = new Set(auditLog().all().map((row) => row.id));
const runsBefore = new Set(runStore().all().map((run) => run.id));

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const row of auditLog().all()) if (!auditBefore.has(row.id)) auditLog().remove(row.id);
  for (const run of runStore().all()) if (!runsBefore.has(run.id)) runStore().remove(run.id);
});

function tokenFor(userId: string): string {
  const issued = issueToken(userId, ADMIN);
  if (!issued) throw new Error(`no user ${userId}`);
  cleanups.push(() => collection(ACCESS_TOKENS_COLLECTION).remove(issued.record.id));
  return issued.token;
}

async function connected(token: string, mode: VersionNegotiationMode = "auto"): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (input, init) => handleMcpRequest(new Request(input, init)),
  });
  const client = new Client({ name: "mcp-test", version: "1.0.0" }, { versionNegotiation: { mode } });
  await client.connect(transport);
  cleanups.push(() => void client.close());
  return client;
}

async function toolNames(token: string, mode?: VersionNegotiationMode): Promise<string[]> {
  const { tools } = await (await connected(token, mode)).listTools();
  return tools.map((tool) => tool.name).sort();
}

async function called(token: string, name: string, args: Record<string, unknown>): Promise<{ ok?: boolean; code?: string; rows?: Record<string, unknown>[] }> {
  const result = await (await connected(token)).callTool({ name, arguments: args });
  const text = "content" in result && Array.isArray(result.content) && result.content[0]?.type === "text" ? String(result.content[0].text) : "";
  const json = text.split("\n").slice(1, -1).join("\n");
  return JSON.parse(json);
}

async function eventually<T>(read: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = read();
    if (value !== undefined) return value;
    await Bun.sleep(10);
  }
  throw new Error("never appeared");
}

describe("the MCP endpoint", () => {
  test("lists each caller's own tools: a role override and a kill switch change one list and not the other, and no tool that writes is offered", async () => {
    setRoleTool("sales_rep", "get_forecast", false, ADMIN);
    cleanups.push(() => {
      const override = overrideFor("sales_rep", "tool", "get_forecast");
      if (override) removeOverride(override.id);
    });
    killTool("get_site", ADMIN);
    cleanups.push(() => void reviveTool("get_site"));
    const ceo = await toolNames(tokenFor(CEO));
    const rep = await toolNames(tokenFor(SALES_REP));
    expect(ceo).toContain("get_forecast");
    expect(rep).not.toContain("get_forecast");
    expect(ceo).not.toContain("get_site");
    expect(rep).not.toContain("get_site");
    for (const writer of ["create_handoff", "send_email", "pin_widget", "request_leave", "set_permission"]) expect(ceo).not.toContain(writer);
  });

  test("a sales rep's query_metric comes back with the northeast only, while the CEO's spans regions", async () => {
    const rep = await called(tokenFor(SALES_REP), "query_metric", BY_REGION);
    const ceo = await called(tokenFor(CEO), "query_metric", BY_REGION);
    expect(rep.ok).toBe(true);
    expect(rep.rows?.map((row) => row.region)).toEqual([NORTHEAST]);
    expect(new Set(ceo.rows?.map((row) => row.region)).size).toBeGreaterThan(1);
  });

  test("a missing, unknown or revoked token is refused before any tool is listed", async () => {
    const token = tokenFor(SALES_REP);
    const issued = accessTokens().find((record) => token.endsWith(record.hint));
    if (!issued) throw new Error("token not stored");
    revokeToken(issued.id);
    const list = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const statuses = await Promise.all(
      [undefined, "Bearer mcp_not-a-real-token", `Bearer ${token}`].map(async (authorization) => {
        const response = await handleMcpRequest(new Request(ENDPOINT, { method: "POST", body: list, headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) } }));
        return [response.status, response.headers.get("www-authenticate")];
      }),
    );
    expect(statuses).toEqual([
      [401, 'Bearer realm="winyu"'],
      [401, 'Bearer realm="winyu"'],
      [401, 'Bearer realm="winyu"'],
    ]);
    expect(connected(token)).rejects.toThrow();
  });

  test("an admin rule on the MCP channel refuses the call, and the audit names the rule", async () => {
    addRule("ห้ามดึงยอดขายผ่าน MCP", 'initiator == "mcp" && tool.name == "query_metric"', ADMIN);
    const rule = policyRules().find((candidate) => candidate.name === "ห้ามดึงยอดขายผ่าน MCP");
    if (!rule) throw new Error("rule not saved");
    cleanups.push(() => void removeRule(rule.id));
    const refused = await called(tokenFor(SALES_REP), "query_metric", BY_REGION);
    expect([refused.ok, refused.code, refused.rows]).toEqual([false, "POLICY_RULE", undefined]);
    const row = auditLog().all().find((entry) => !auditBefore.has(entry.id) && entry.tool === "query_metric");
    expect([row?.decision, row?.code, row?.rule?.name]).toEqual(["deny", "POLICY_RULE", "ห้ามดึงยอดขายผ่าน MCP"]);
  });

  test("a call leaves an audit row with the MCP channel and the token's user, tied to a saved run that says it came over MCP", async () => {
    await called(tokenFor(SALES_REP), "query_metric", BY_REGION);
    const row = auditLog().all().find((entry) => !auditBefore.has(entry.id) && entry.tool === "query_metric");
    expect([row?.initiator, row?.userId, row?.decision]).toEqual(["mcp", SALES_REP, "allow"]);
    const run = await eventually(() => (row?.turnId ? (runStore().get(row.turnId) ?? undefined) : undefined));
    const start = run.events.find((event) => event.type === "agent.started");
    expect(start?.type === "agent.started" ? start.payload.goal.intent : null).toBe("mcp:query_metric");
    expect(run.events.at(-1)?.type).toBe("agent.completed");
  });

  test("a 2025-era client that never negotiates gets the same tools and the same scoped rows", async () => {
    const token = tokenFor(SALES_REP);
    expect(await toolNames(token, "legacy")).toEqual(await toolNames(token, "auto"));
    const result = await (await connected(token, "legacy")).callTool({ name: "query_metric", arguments: BY_REGION });
    expect(JSON.stringify(result)).toContain(NORTHEAST);
    expect(JSON.stringify(result)).not.toContain("ภาคใต้");
  });
});
