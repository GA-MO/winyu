import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { AccessContext } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { newRun, runWithRun } from "@/lib/harness/runtime";
import { winyuTools } from "@/lib/server/agent/tools";
import { requestLinks } from "@/lib/server/agent/collections";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { forwardDecision } from "@/lib/server/staff-requests";
import { collection } from "@/lib/server/store/json-store";
import { GENERATOR_PORTS } from "./generator";
import { DEMO_LEAVE_REQUESTS } from "./generator-leave";
import { ports, registerPorts, resetPorts } from "./index";
import { PortUnavailable } from "./unavailable";

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
  const turn = { turnId: run.id, threadId: null, preloadPacketId: null, question: `test ${name}`, queries: [] };
  return runWithAccess(accessOf(userId), () => runWithTurn(turn, () => runWithRun(run, () => tool.execute(tool.inputSchema().parse(args), { toolCallId: randomUUID() }))));
}

function linkOf(requestId: string) {
  const link = requestLinks().where((entry) => entry.requestId === requestId)[0];
  if (!link) throw new Error(`no Inbox packet linked to ${requestId}`);
  return link;
}

afterEach(() => resetPorts());

describe("a system that does not answer", () => {
  test("its tools say ข้อมูลไม่พร้อม instead of answering from nothing, and a write files nothing", async () => {
    const down = () => Promise.reject(new PortUnavailable("directory", "unreachable", "test"));
    const leaveDown = () => Promise.reject(new PortUnavailable("leave", "unreachable", "test"));
    registerPorts({ directory: { load: down }, leave: { ...GENERATOR_PORTS.leave, policy: leaveDown, balances: leaveDown } });
    expect(await callTool("u_thana", "find_people", { region: null, department: null, manager: null, query: null, flag: null })).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
    const filed = collection(DEMO_LEAVE_REQUESTS).all().length;
    expect(await callTool(REP, "request_leave", { kind: "annual", from: "2026-10-26", to: "2026-10-27", reason: "ธุระส่วนตัว" })).toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
    expect(collection(DEMO_LEAVE_REQUESTS).all().length).toBe(filed);
  });
});

describe("requests live in the system that owns them", () => {
  test("a leave request is held by the leave system, and the approver's return there gives the days back", async () => {
    const pendingOf = async () => (await ports().leave.balances(REP)).find((balance) => balance.kind === "personal")?.pending ?? 0;
    const before = await pendingOf();
    const ask = { kind: "personal", from: "2026-10-22", to: "2026-10-22", reason: "ธุระที่ธนาคาร" };
    expect(await callTool(REP, "request_leave", ask)).toMatchObject({ ok: true });
    expect(await pendingOf()).toBe(before + 1);
    const request = (await ports().leave.requests(REP)).find((entry) => entry.from === ask.from && entry.status === "pending");
    if (!request) throw new Error("the leave system holds no request");
    const link = linkOf(request.id);
    await forwardDecision(link.id, "u_somchai", "return");
    expect(await pendingOf()).toBe(before + 1);
    await forwardDecision(link.id, link.approverId, "return");
    expect((await ports().leave.requests(REP)).find((entry) => entry.id === request.id)?.status).toBe("returned");
    expect(await pendingOf()).toBe(before);
  });

  test("a seat is held by the LMS once, a second one for the same person is refused, and the manager's return gives the seat back", async () => {
    const course = (await ports().learning.courses()).find((entry) => entry.seats - entry.enrolled >= 1 && entry.starts > "2026-10-01" && !entry.renewsCertificate);
    if (!course) throw new Error("no open course");
    const enrolledOf = async () => (await ports().learning.courses()).find((entry) => entry.id === course.id)?.enrolled ?? 0;
    const before = await enrolledOf();
    expect(await callTool(REP, "enroll_course", { courseId: course.id })).toMatchObject({ ok: true });
    expect(await enrolledOf()).toBe(before + 1);
    expect(await callTool(REP, "enroll_course", { courseId: course.id })).toMatchObject({ ok: false });
    const enrollment = (await ports().learning.enrollments(REP)).find((entry) => entry.courseId === course.id && entry.status === "pending");
    if (!enrollment) throw new Error("the LMS holds no seat");
    await forwardDecision(linkOf(enrollment.id).id, linkOf(enrollment.id).approverId, "return");
    expect(await enrolledOf()).toBe(before);
  });
});
