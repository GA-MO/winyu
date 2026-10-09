import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { resetClientPool } from "@/lib/server/connectors/pool";
import { ehsDemoFetchFor } from "@/scripts/mcp-demo-ehs";
import { GENERATOR_PORTS } from "./generator";
import { registerPorts, resetPorts } from "./index";
import { NOWHERE, PERSONAS, answerEveryCallWith, bothWays, callTool, serve, statusesOfStrangers, type Served } from "./mcp-test-kit";
import { sitesMcpPort } from "./sites-mcp";
import { PortUnavailable } from "./unavailable";

const SECRET = "sites-mcp-test-secret";
const QUESTIONS = [
  { id: null, name: null },
  { id: "pl_khonkaen", name: null },
  { id: "dc_bangkok", name: null },
  { id: null, name: "สิงห์บุรี" },
  { id: "hq_bangkok", name: null },
];

let ehs: Served;

beforeAll(() => {
  ehs = serve(ehsDemoFetchFor({ ...GENERATOR_PORTS, secret: () => SECRET }));
});

afterAll(() => ehs.stop());

afterEach(() => {
  resetPorts();
  resetClientPool();
});

describe("the sites port over the safety system's MCP", () => {
  test("get_site reads the same through MCP as in-process, for every persona", async () => {
    const sites = sitesMcpPort({ url: ehs.url, secret: SECRET, timeoutMs: 5_000 });
    expect(await sites.load()).toEqual(await GENERATOR_PORTS.sites.load());
    for (const [who, access] of Object.entries(PERSONAS)) {
      for (const question of QUESTIONS) {
        const { local, remote } = await bothWays({ sites }, () => callTool(access, "get_site", question));
        expect({ who, question, remote }).toEqual({ who, question, remote: local });
      }
    }
  });

  test("the safety system refuses a request Winyu did not sign, and one signed with another secret", async () => {
    expect(await statusesOfStrangers(ehs.url)).toEqual({ unsigned: 401, forged: 401 });
    const forged = sitesMcpPort({ url: ehs.url, secret: "not-the-secret", timeoutMs: 2_000 });
    expect(await forged.load().catch((error: unknown) => error)).toBeInstanceOf(PortUnavailable);
  });

  test("an incident log that is not the contract is rejected at the boundary", async () => {
    answerEveryCallWith({ sites: [], incidents: [{ id: "i1", siteId: "pl_khonkaen", kind: "explosion" }] });
    const failure = await sitesMcpPort({ url: NOWHERE, secret: SECRET, timeoutMs: 2_000 }).load().catch((error: unknown) => error);
    expect(failure).toMatchObject({ port: "sites", reason: "malformed" });
  });

  test("with the safety system down, get_site answers ข้อมูลไม่พร้อม instead of a site with no incidents", async () => {
    registerPorts({ sites: sitesMcpPort({ url: NOWHERE, secret: SECRET, timeoutMs: 300 }) });
    for (const [who, access] of Object.entries(PERSONAS)) {
      const answer = await callTool(access, "get_site", QUESTIONS[1]);
      expect({ who, answer }).toEqual({ who, answer: { ok: false, code: "CONNECTOR_UNAVAILABLE", error: TH.cards.failed.portDown(TH.cards.failed.systems.sites) } });
    }
  });
});
