import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("@/lib/harness/adapters/mastra/serve");
const { asksApproval } = await import("@/lib/harness/gateway");
const { winyuTools } = await import("@/lib/server/agent/tools");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { findUser } = await import("@/lib/data/entities/users");
const { addDays, businessToday } = await import("@/lib/data/dates");
const { runWithAccess } = await import("@/lib/server/request-context");
const { ports } = await import("@/lib/server/ports");
const { calendarOf } = await import("@/lib/server/ports/calendar");
const { workdaysBetween } = await import("@/lib/server/leave");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const REP = "u_krit";
const SEARCH_DAYS = 400;

function rep() {
  const found = findUser(REP);
  if (!found) throw new Error(`no ${REP}`);
  return liveAccessFor(found);
}

async function calendar() {
  return calendarOf(await ports().calendar.load());
}

async function weekdayHoliday(): Promise<string> {
  const days = await calendar();
  for (let offset = 1; offset < SEARCH_DAYS; offset += 1) {
    const day = addDays(businessToday(), offset);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (days.holidayOn(day) && weekday !== 0 && weekday !== 6) return day;
  }
  throw new Error("no weekday holiday ahead of today in the calendar");
}

async function workdayAhead(offset: number): Promise<string> {
  const days = await calendar();
  for (let day = addDays(businessToday(), offset); ; day = addDays(day, 1)) if (workdaysBetween(day, day, days) === 1) return day;
}

function asks(input: Record<string, unknown>): Promise<boolean> {
  return runWithAccess(rep(), () => asksApproval(winyuTools().request_leave.capability, input));
}

function leave(kind: string, day: string) {
  return { kind, from: day, to: day, reason: "" };
}

async function leaveRows(): Promise<number> {
  return (await ports().leave.requests(REP)).length;
}

describe("request_leave is checked before the person is asked", () => {
  test("a request that would file asks for approval", async () => {
    expect(await asks(leave("personal", await workdayAhead(14)))).toBe(true);
  });

  test("a public holiday or a past date asks nothing", async () => {
    expect(await asks(leave("personal", await weekdayHoliday()))).toBe(false);
    expect(await asks(leave("personal", await workdayAhead(-10)))).toBe(false);
  });

  test("in the chat a leave on a holiday raises no approval card and files nothing, and the model is told why", async () => {
    const before = await leaveRows();
    scripted.script([{ call: "request_leave", args: leave("personal", await weekdayHoliday()) }, { text: "วันนั้นเป็นวันหยุด ยังไม่ได้ยื่นลา" }]);
    const body = { threadId: `leave-${Date.now()}`, runId: crypto.randomUUID(), state: {}, messages: [{ id: crypto.randomUUID(), role: "user", content: "ขอลากิจวันหยุดนั้น" }], tools: [], context: [], forwardedProps: {} };
    const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
    const sse = await (await serveCopilot(rep(), request, LEARNING)).text();
    expect(sse).not.toContain('"interrupt"');
    expect(sse).toContain("TOOL_CALL_RESULT");
    expect(await leaveRows()).toBe(before);
  });
});
