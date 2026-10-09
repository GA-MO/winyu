import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { resetClientPool } from "@/lib/server/connectors/pool";
import { feedFor } from "@/lib/server/feed";
import { lmsDemoFetchFor } from "@/scripts/mcp-demo-lms";
import { GENERATOR_PORTS } from "./generator";
import { registerPorts, resetPorts } from "./index";
import { learningMcpPort } from "./learning-mcp";
import { NOWHERE, PERSONAS, answerEveryCallWith, bothWays, callTool, serve, statusesOfStrangers, type Served } from "./mcp-test-kit";
import { PortUnavailable } from "./unavailable";

const SECRET = "learning-mcp-test-secret";
const NOW = Date.parse("2026-09-22T09:00:00+07:00");
const QUESTIONS = [
  { month: null, query: null },
  { month: "2026-10", query: null },
  { month: null, query: "ขาย" },
  { month: null, query: "ความปลอดภัย" },
];

let lms: Served;

beforeAll(() => {
  lms = serve(lmsDemoFetchFor({ ...GENERATOR_PORTS, secret: () => SECRET }));
});

afterAll(() => lms.stop());

afterEach(() => {
  resetPorts();
  resetClientPool();
});

describe("the learning port over the LMS's MCP", () => {
  test("list_courses and the feed read the same through MCP as in-process, for every persona", async () => {
    const learning = learningMcpPort({ url: lms.url, secret: SECRET, timeoutMs: 5_000 });
    expect(await learning.courses()).toEqual([...(await GENERATOR_PORTS.learning.courses())]);
    for (const [who, access] of Object.entries(PERSONAS)) {
      for (const question of QUESTIONS) {
        const { local, remote } = await bothWays({ learning }, () => callTool(access, "list_courses", question));
        expect({ who, question, remote }).toEqual({ who, question, remote: local });
        expect(local).toMatchObject({ ok: true });
      }
      const feeds = await bothWays({ learning }, () => feedFor(access, NOW));
      expect({ who, feed: feeds.remote }).toEqual({ who, feed: feeds.local });
    }
  });

  test("the LMS refuses a request Winyu did not sign, and one signed with another secret", async () => {
    expect(await statusesOfStrangers(lms.url)).toEqual({ unsigned: 401, forged: 401 });
    const forged = learningMcpPort({ url: lms.url, secret: "not-the-secret", timeoutMs: 2_000 });
    expect(await forged.courses().catch((error: unknown) => error)).toBeInstanceOf(PortUnavailable);
  });

  test("a catalogue that is not the contract is rejected at the boundary", async () => {
    answerEveryCallWith({ courses: [{ id: "c1", titleTh: "หลักสูตร", seats: "ยี่สิบ" }] });
    const failure = await learningMcpPort({ url: NOWHERE, secret: SECRET, timeoutMs: 2_000 }).courses().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PortUnavailable);
    expect(failure).toMatchObject({ port: "learning", reason: "malformed" });
  });

  test("with the LMS down, list_courses and enroll_course answer ข้อมูลไม่พร้อม instead of an empty catalogue", async () => {
    const learning = learningMcpPort({ url: NOWHERE, secret: SECRET, timeoutMs: 300 });
    const { remote: listed } = await bothWays({ learning }, () => callTool(PERSONAS.rep, "list_courses", QUESTIONS[0]));
    expect(listed).toEqual({ ok: false, code: "CONNECTOR_UNAVAILABLE", error: TH.cards.failed.portDown(TH.cards.failed.systems.learning) });
    registerPorts({ learning });
    const enrolled = await callTool(PERSONAS.rep, "enroll_course", { courseId: "crs_first_aid" });
    expect(enrolled).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
  });

  test("with the LMS down, a feed that needs the catalogue says the data is not ready instead of dropping the matter silently", async () => {
    registerPorts({ learning: learningMcpPort({ url: NOWHERE, secret: SECRET, timeoutMs: 300 }) });
    const said: Record<string, boolean> = {};
    for (const [who, access] of Object.entries(PERSONAS)) said[who] = (await feedFor(access, NOW)).some((item) => item.key === "system:down:learning" && item.reason === TH.feed.system.portDown);
    expect(said).toEqual({ ceo: false, rep: true, hr: true, it: false });
  });
});
