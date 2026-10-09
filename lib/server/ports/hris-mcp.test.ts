import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { staffRequests } from "@/lib/server/agent/collections";
import { resetClientPool } from "@/lib/server/connectors/pool";
import { feedFor } from "@/lib/server/feed";
import { hrisDemoFetchFor } from "@/scripts/mcp-demo-hris";
import type { DirectoryPort } from "./directory";
import { GENERATOR_PORTS } from "./generator";
import { directoryMcpPort, leaveMcpPort, recruitingMcpPort } from "./hris-mcp";
import { registerPorts, resetPorts } from "./index";
import { NOWHERE, PERSONAS, answerEveryCallWith, bothWays, callTool, serve, statusesOfStrangers, type Served } from "./mcp-test-kit";
import { PortUnavailable } from "./unavailable";

const SECRET = "hris-mcp-test-secret";
const NOW = Date.parse("2026-09-22T09:00:00+07:00");
const DOWN_MS = 300;
const PEOPLE_TOOLS = ["find_people", "get_person", "list_candidates"];

const CALLS: [string, Record<string, unknown>][] = [
  ["find_people", { region: null, department: null, manager: null, query: null, flag: null }],
  ["find_people", { region: "northeast", department: null, manager: null, query: null, flag: null }],
  ["find_people", { region: null, department: null, manager: null, query: null, flag: "cert_expiring" }],
  ["find_people", { region: null, department: null, manager: "คุณอนุชา", query: null, flag: null }],
  ["get_person", { id: "u_krit", name: null }],
  ["get_person", { id: null, name: "คุณพลอย" }],
  ["get_person", { id: "u_thana", name: null }],
  ["list_candidates", { position: null, stage: null }],
  ["list_candidates", { position: null, stage: "interview" }],
  ["get_policy", { topic: "leave" }],
  ["get_policy", { topic: "benefits" }],
  ["get_site", { id: "pl_khonkaen", name: null }],
  ["list_courses", { month: null, query: null }],
];

const EVERYONE = USERS.map((user) => ({ who: user.id, access: accessFor(user) }));

let hris: Served;
let hrisCalls = 0;

function counted(directory: DirectoryPort): DirectoryPort {
  return { load: () => ((hrisCalls += 1), directory.load()) };
}

function hrisPorts(url: string, secret = SECRET, timeoutMs = 5_000) {
  const endpoint = { url, secret, timeoutMs };
  return { directory: directoryMcpPort(endpoint), leave: leaveMcpPort(endpoint), recruiting: recruitingMcpPort(endpoint) };
}

function isPersonItem(key: string): boolean {
  return ["person:", "own:", "team:", "opening:"].some((prefix) => key.startsWith(prefix));
}

beforeAll(() => {
  hris = serve(hrisDemoFetchFor({ ...GENERATOR_PORTS, directory: counted(GENERATOR_PORTS.directory), secret: () => SECRET }));
});

afterAll(() => hris.stop());

afterEach(() => {
  resetPorts();
  resetClientPool();
});

describe("the directory, leave and recruiting ports over the HRIS's MCP", () => {
  test("people, candidates, policy, sites, courses and the feed read the same through MCP as in-process, for every persona", async () => {
    const ports = hrisPorts(hris.url);
    expect(await ports.directory.load()).toEqual(await GENERATOR_PORTS.directory.load());
    expect(await ports.leave.usedThisYear("u_krit")).toEqual(await GENERATOR_PORTS.leave.usedThisYear("u_krit"));
    for (const [who, access] of Object.entries(PERSONAS)) {
      for (const [tool, args] of CALLS) {
        const { local, remote } = await bothWays(ports, () => callTool(access, tool, args));
        expect({ who, tool, args, remote }).toEqual({ who, tool, args, remote: local });
      }
      const feeds = await bothWays(ports, () => feedFor(access, NOW));
      expect({ who, feed: feeds.remote }).toEqual({ who, feed: feeds.local });
    }
  });

  test("the directory is read once within its window, however many tools ask", async () => {
    const ports = hrisPorts(hris.url);
    const before = hrisCalls;
    registerPorts(ports);
    await callTool(PERSONAS.ceo, "find_people", CALLS[0][1]);
    await callTool(PERSONAS.hr, "get_person", CALLS[4][1]);
    await feedFor(PERSONAS.rep, NOW);
    expect(hrisCalls - before).toBe(1);
  });

  test("the HRIS refuses a request Winyu did not sign, and one signed with another secret", async () => {
    expect(await statusesOfStrangers(hris.url)).toEqual({ unsigned: 401, forged: 401 });
    const forged = hrisPorts(hris.url, "not-the-secret", 2_000);
    expect(await forged.directory.load().catch((error: unknown) => error)).toBeInstanceOf(PortUnavailable);
  });

  test("a directory that is not the contract is rejected at the boundary, never read as a smaller directory", async () => {
    answerEveryCallWith({ employees: [{ id: "u_krit", nameTh: "คุณกฤต" }], openPositions: [] });
    const failure = await hrisPorts(NOWHERE, SECRET, 2_000).directory.load().catch((error: unknown) => error);
    expect(failure).toMatchObject({ port: "directory", reason: "malformed" });
    const policy = await hrisPorts(NOWHERE, SECRET, 2_000).leave.policy().catch((error: unknown) => error);
    expect(policy).toMatchObject({ port: "leave", reason: "malformed" });
  });

  test("with the HRIS down, people tools answer ข้อมูลไม่พร้อม and leave tools refuse rather than file", async () => {
    registerPorts(hrisPorts(NOWHERE, SECRET, DOWN_MS));
    expect(await callTool(PERSONAS.ceo, "find_people", CALLS[0][1])).toEqual({ ok: false, code: "CONNECTOR_UNAVAILABLE", error: TH.cards.failed.portDown(TH.cards.failed.systems.directory) });
    expect(await callTool(PERSONAS.rep, "get_policy", { topic: "leave" })).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
    const filed = staffRequests().all().length;
    expect(await callTool(PERSONAS.rep, "request_leave", { kind: "annual", from: "2026-10-12", to: "2026-10-13", reason: "ธุระส่วนตัว" })).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
    expect(staffRequests().all().length).toBe(filed);
  });

  test("an HRIS outage never widens anyone's access: no person, candidate or site row for any user, and no people matters in any feed", async () => {
    registerPorts(hrisPorts(NOWHERE, SECRET, DOWN_MS));
    for (const { who, access } of EVERYONE) {
      for (const [tool, args] of CALLS.filter(([name]) => PEOPLE_TOOLS.includes(name) || name === "get_site")) {
        const answer = await callTool(access, tool, args);
        const refused = typeof answer === "object" && answer !== null && "ok" in answer && answer.ok === false;
        expect({ who, tool, refused }).toEqual({ who, tool, refused: true });
      }
      const feed = await feedFor(access, NOW);
      expect({ who, people: feed.filter((item) => isPersonItem(item.key)).map((item) => item.key) }).toEqual({ who, people: [] });
    }
  });

  test("with the HRIS answering garbage, the LMS's training history keeps every row back, because nobody's view can be worked out", async () => {
    const row = { employee_id: "u_krit", employee_name: "คุณกฤต", region: "northeast", kind_label: "อบรม", course: "การขาย", date: "2026-01-10", date_label: "10 ม.ค. 2569", expires_label: null, score: 80, score_label: "80 คะแนน" };
    answerEveryCallWith({ items: [row] });
    registerPorts(hrisPorts(NOWHERE, SECRET, DOWN_MS));
    for (const { who, access } of EVERYONE) {
      const answer = await callTool(access, "lms_demo__training_history", { employeeId: "u_krit", name: null, regions: null });
      expect({ who, answer }).toMatchObject({ who, answer: { ok: false, code: "CONNECTOR_UNAVAILABLE" } });
    }
  });

  test("with the HRIS down, a feed that would carry people matters says the data is not ready", async () => {
    const local: Record<string, boolean> = {};
    for (const [who, access] of Object.entries(PERSONAS)) local[who] = (await feedFor(access, NOW)).some((item) => isPersonItem(item.key));
    registerPorts(hrisPorts(NOWHERE, SECRET, DOWN_MS));
    const said: Record<string, boolean> = {};
    for (const [who, access] of Object.entries(PERSONAS)) said[who] = (await feedFor(access, NOW)).some((item) => item.key === "system:down:directory");
    expect(said).toEqual(Object.fromEntries(Object.keys(PERSONAS).map((who) => [who, true])));
    expect(Object.values(local).some(Boolean)).toBe(true);
  });
});
