import { afterEach, describe, expect, test } from "bun:test";
import type { AccessContext } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { businessDay } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { newRun, runWithRun } from "@/lib/harness/runtime";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { decideStaffRequest, staffRequests } from "@/lib/server/staff-requests";
import { collection } from "@/lib/server/store/json-store";
import { GENERATOR_PORTS } from "./generator";
import { DEMO_LEAVE_REQUESTS } from "./generator-leave";
import { ports, registerPorts, resetPorts } from "./index";
import { PortUnavailable } from "./unavailable";
import { approvedCallId } from "@/scripts/approved-call";

const REP = "u_krit";

function accessOf(id: string): AccessContext {
  const user = findUser(id);
  if (!user) throw new Error(`no user ${id}`);
  return liveAccessFor(user);
}

function callTool(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = winyuTools()[name];
  if (!tool) throw new Error(`no tool ${name}`);
  const run = newRun(userId, null, { initiator: "system" });
  const turn = { turnId: run.id, threadId: null, question: `test ${name}`, queries: [] };
  return runWithAccess(accessOf(userId), () => runWithTurn(turn, () => runWithRun(run, () => tool.execute(tool.inputSchema().parse(args), { toolCallId: approvedCallId(userId, name) }))));
}

function linkOf(requestId: string) {
  const link = staffRequests().find((entry) => entry.requestId === requestId);
  if (!link) throw new Error(`no Inbox request linked to ${requestId}`);
  return link;
}

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no user ${id}`);
  return found;
}

afterEach(() => resetPorts());

describe("a system that does not answer", () => {
  test("its tools say ข้อมูลไม่พร้อม instead of answering from nothing, and a write files nothing", async () => {
    const down = () => Promise.reject(new PortUnavailable("directory", "unreachable", "test"));
    const leaveDown = () => Promise.reject(new PortUnavailable("leave", "unreachable", "test"));
    registerPorts({ directory: { load: down }, leave: { ...GENERATOR_PORTS.leave, policy: leaveDown, balances: leaveDown } });
    expect(await callTool("u_thana", "find_people", { region: null, department: null, manager: null, query: null, flag: null })).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
    const filed = collection(DEMO_LEAVE_REQUESTS).all().length;
    expect(await callTool(REP, "request_leave", { kind: "annual", from: businessDay(32), to: businessDay(33), reason: "ธุระส่วนตัว" })).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
    expect(collection(DEMO_LEAVE_REQUESTS).all().length).toBe(filed);
  });
});

describe("requests live in the system that owns them", () => {
  test("a leave request is held by the leave system, and the approver's return there gives the days back", async () => {
    const pendingOf = async () => (await ports().leave.balances(REP)).find((balance) => balance.kind === "personal")?.pending ?? 0;
    const before = await pendingOf();
    const ask = { kind: "personal", from: businessDay(32), to: businessDay(32), reason: "ธุระที่ธนาคาร" };
    expect(await callTool(REP, "request_leave", ask)).toMatchObject({ ok: true });
    expect(await pendingOf()).toBe(before + 1);
    const request = (await ports().leave.requests(REP)).find((entry) => entry.from === ask.from && entry.status === "pending");
    if (!request) throw new Error("the leave system holds no request");
    const link = linkOf(request.id);
    expect(await decideStaffRequest(link.id, user("u_somchai"), "decline")).toEqual({ ok: false, reason: "not_found" });
    expect(await pendingOf()).toBe(before + 1);
    expect((await decideStaffRequest(link.id, user(link.approverId), "decline")).ok).toBe(true);
    expect(await decideStaffRequest(link.id, user(link.approverId), "approve")).toEqual({ ok: false, reason: "decided" });
    expect((await ports().leave.requests(REP)).find((entry) => entry.id === request.id)?.status).toBe("returned");
    expect(await pendingOf()).toBe(before);
  });

  test("a seat is held by the LMS once, a second one for the same person is refused, and the manager's return gives the seat back", async () => {
    const course = (await ports().learning.courses()).find((entry) => entry.seats - entry.enrolled >= 1 && entry.starts > businessDay(9) && !entry.renewsCertificate);
    if (!course) throw new Error("no open course");
    const enrolledOf = async () => (await ports().learning.courses()).find((entry) => entry.id === course.id)?.enrolled ?? 0;
    const before = await enrolledOf();
    expect(await callTool(REP, "enroll_course", { courseId: course.id })).toMatchObject({ ok: true });
    expect(await enrolledOf()).toBe(before + 1);
    expect(await callTool(REP, "enroll_course", { courseId: course.id })).toMatchObject({ ok: false });
    const enrollment = (await ports().learning.enrollments(REP)).find((entry) => entry.courseId === course.id && entry.status === "pending");
    if (!enrollment) throw new Error("the LMS holds no seat");
    await decideStaffRequest(linkOf(enrollment.id).id, user(linkOf(enrollment.id).approverId), "decline");
    expect(await enrolledOf()).toBe(before);
  });
});
