import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { staffRequests } from "@/lib/server/agent/collections";
import { resetClientPool } from "@/lib/server/connectors/pool";
import { calendarDemoFetchFor } from "@/scripts/mcp-demo-calendar";
import type { CalendarPort } from "./calendar";
import { calendarMcpPort } from "./calendar-mcp";
import { GENERATOR_PORTS } from "./generator";
import { registerPorts, resetPorts } from "./index";
import { NOWHERE, PERSONAS, answerEveryCallWith, bothWays, callTool, serve, statusesOfStrangers, type Served } from "./mcp-test-kit";
import { PortUnavailable } from "./unavailable";

const SECRET = "calendar-mcp-test-secret";
const QUESTIONS = [
  { from: null, to: null },
  { from: "2026-10-01", to: "2026-12-31" },
  { from: "2026-07-01", to: "2026-08-15" },
  { from: "2027-01-01", to: "2027-01-02" },
];

let calendar: Served;
let calendarCalls = 0;

function counted(port: CalendarPort): CalendarPort {
  return { load: () => ((calendarCalls += 1), port.load()) };
}

beforeAll(() => {
  calendar = serve(calendarDemoFetchFor({ calendar: counted(GENERATOR_PORTS.calendar), secret: () => SECRET }));
});

afterAll(() => calendar.stop());

afterEach(() => {
  resetPorts();
  resetClientPool();
});

describe("the calendar port over the company calendar's MCP", () => {
  test("get_calendar and the leave policy read the same through MCP as in-process, for every persona", async () => {
    const port = calendarMcpPort({ url: calendar.url, secret: SECRET, timeoutMs: 5_000 });
    expect(await port.load()).toEqual(await GENERATOR_PORTS.calendar.load());
    for (const [who, access] of Object.entries(PERSONAS)) {
      for (const question of QUESTIONS) {
        const { local, remote } = await bothWays({ calendar: port }, () => callTool(access, "get_calendar", question));
        expect({ who, question, remote }).toEqual({ who, question, remote: local });
      }
      const policy = await bothWays({ calendar: port }, () => callTool(access, "get_policy", { topic: "leave" }));
      expect({ who, policy: policy.remote }).toEqual({ who, policy: policy.local });
    }
  });

  test("the calendar is read once within its window", async () => {
    registerPorts({ calendar: calendarMcpPort({ url: calendar.url, secret: SECRET, timeoutMs: 5_000 }) });
    const before = calendarCalls;
    for (const question of QUESTIONS) await callTool(PERSONAS.ceo, "get_calendar", question);
    expect(calendarCalls - before).toBe(1);
  });

  test("the calendar refuses a request Winyu did not sign, and one signed with another secret", async () => {
    expect(await statusesOfStrangers(calendar.url)).toEqual({ unsigned: 401, forged: 401 });
    const forged = calendarMcpPort({ url: calendar.url, secret: "not-the-secret", timeoutMs: 2_000 });
    expect(await forged.load().catch((error: unknown) => error)).toBeInstanceOf(PortUnavailable);
  });

  test("a calendar that is not the contract is rejected at the boundary", async () => {
    answerEveryCallWith({ holidays: [{ date: "13 ต.ค.", nameTh: "วันนวมินทรมหาราช", label: "holiday" }], alcoholBanDates: [], festivals: [] });
    const failure = await calendarMcpPort({ url: NOWHERE, secret: SECRET, timeoutMs: 2_000 }).load().catch((error: unknown) => error);
    expect(failure).toMatchObject({ port: "calendar", reason: "malformed" });
  });

  test("with the calendar down, get_calendar answers ข้อมูลไม่พร้อม rather than 'no events', and leave is not filed against unknown holidays", async () => {
    registerPorts({ calendar: calendarMcpPort({ url: NOWHERE, secret: SECRET, timeoutMs: 300 }) });
    for (const [who, access] of Object.entries(PERSONAS)) {
      const answer = await callTool(access, "get_calendar", QUESTIONS[1]);
      expect({ who, answer }).toEqual({ who, answer: { ok: false, code: "CONNECTOR_UNAVAILABLE", error: TH.cards.failed.portDown(TH.cards.failed.systems.calendar) } });
    }
    const filed = staffRequests().all().length;
    expect(await callTool(PERSONAS.rep, "request_leave", { kind: "annual", from: "2026-10-12", to: "2026-10-14", reason: "ธุระส่วนตัว" })).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
    expect(staffRequests().all().length).toBe(filed);
  });
});
