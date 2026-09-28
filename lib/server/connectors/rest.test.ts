import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { AccessContext } from "@/lib/contracts";
import { defineRestConnector } from "./define";
import { restRequestOf } from "./rest";
import type { RestConnectorConfig, RestToolConfig } from "./types";

const TOOL: RestToolConfig = {
  method: "GET",
  path: "/agents/{agentId}/visits",
  labelTh: "ดูการเยี่ยม",
  description: "Visits of one agent.",
  tier: "read",
  roles: "all",
  input: z.object({ agentId: z.string(), since: z.string().nullable(), regions: z.string().nullable() }),
  output: () => ({ rows: [] }),
  scope: { kind: "none", reason: "test" },
};

function config(tools: Record<string, RestToolConfig>, overrides: Partial<RestConnectorConfig> = {}): RestConnectorConfig {
  return { id: "crm_test", labelTh: "CRM", sourceSystemTh: "CRM", baseUrl: "https://crm.example.com/api/", auth: () => ({ "x-winyu-user": "u_test" }), timeoutMs: 1000, tools, ...overrides };
}

const ACCESS = { userId: "u_test" } as AccessContext;

describe("defineRestConnector", () => {
  test("opens each endpoint as one tool on the surface with kind rest", () => {
    const connector = defineRestConnector(config({ visits: TOOL }));
    expect(connector.def.kind).toBe("rest");
    expect(connector.tools.map((tool) => tool.entry.name)).toEqual(["crm_test__visits"]);
  });

  test("refuses what a REST config must not leave open", () => {
    expect(() => defineRestConnector(config({ a: { ...TOOL, method: "DELETE" as "GET" } }))).toThrow("only GET and POST");
    expect(() => defineRestConnector(config({ a: { ...TOOL, path: "//evil.example.com/x" } }))).toThrow("path must start");
    expect(() => defineRestConnector(config({ a: { ...TOOL, path: "/visits?all=1" } }))).toThrow("path must start");
    expect(() => defineRestConnector(config({ a: { ...TOOL, path: "/agents/{dealer}/visits" } }))).toThrow("{dealer}");
    expect(() => defineRestConnector(config({ a: { ...TOOL, description: "" } }))).toThrow("needs a description");
    expect(() => defineRestConnector(config({ a: { ...TOOL, scope: undefined } as unknown as RestToolConfig }))).toThrow("declares no scope");
    expect(() => defineRestConnector(config({ a: TOOL }, { baseUrl: "file:///etc" }))).toThrow("http(s)");
    expect(() => defineRestConnector(config({ a: TOOL }, { id: "warehouse" }))).toThrow("native connector");
  });
});

describe("restRequestOf", () => {
  test("GET fills and encodes the path, puts the rest in the query and drops empty arguments", () => {
    const request = restRequestOf(config({ visits: TOOL }), TOOL, { agentId: "ag/../admin", since: null, regions: "northeast" }, ACCESS);
    const url = new URL(request.url);
    expect(url.origin).toBe("https://crm.example.com");
    expect(url.pathname).toBe("/api/agents/ag%2F..%2Fadmin/visits");
    expect([...url.searchParams.entries()]).toEqual([["regions", "northeast"]]);
    expect(request.headers.get("x-winyu-user")).toBe("u_test");
    expect(request.redirect).toBe("error");
  });

  test("POST sends the arguments that are not in the path as a JSON body", async () => {
    const post: RestToolConfig = { ...TOOL, method: "POST" };
    const request = restRequestOf(config({ visits: post }), post, { agentId: "ag_1", since: "2026-09-01", regions: null }, ACCESS);
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(await request.json()).toEqual({ since: "2026-09-01" });
  });
});
