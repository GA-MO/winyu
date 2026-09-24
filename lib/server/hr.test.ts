import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { accessFor } from "@/lib/access/policies";
import { COURSES } from "@/lib/data/entities/courses";
import { findUser } from "@/lib/data/entities/users";
import { notifications, outbox, packets, staffRequests } from "./agent/collections";
import { enrollCourse, listCourses } from "./courses";
import { policyFor, requestLeave, workdaysBetween } from "./leave";
import { listCandidates } from "./recruiting";
import { ports } from "./ports";
import { calendarOf } from "./ports/calendar";

const requested: string[] = [];

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return accessFor(user);
}

function forget(userId: string): void {
  for (const request of staffRequests().all().filter((entry) => entry.userId === userId)) {
    if (!requested.includes(request.id)) continue;
    packets().remove(request.packetId);
    for (const note of notifications().where((entry) => entry.refId === request.packetId)) notifications().remove(note.id);
    for (const mail of outbox().where((entry) => entry.refId === request.packetId)) outbox().remove(mail.id);
    staffRequests().remove(request.id);
  }
}

afterAll(() => {
  forget("u_krit");
  forget("u_may");
});

describe("candidates", () => {
  test("HR sees the Khon Kaen sales opening, furthest along first", async () => {
    const result = await listCandidates(accessOf("u_may"), { position: "พนักงานขายขอนแก่น", stage: null });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.position?.id).toBe("op_ne_khonkaen");
    expect(result.data.candidates[0]?.stage).toBe("ยื่นข้อเสนอ");
    expect(result.data.metrics).toHaveLength(3);
    expect(result.data.candidates[0]).toHaveProperty("expected_salary");
  });

  test("the regional manager sees only the openings in his line, without expected pay", async () => {
    const result = await listCandidates(accessOf("u_anucha"), { position: null, stage: null });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.positions.map((position) => position.id).sort()).toEqual(["op_ne_khonkaen", "op_ne_korat", "op_ne_ubon"]);
    expect(result.data.candidates[0]).not.toHaveProperty("expected_salary");
  });

  test("a sales rep cannot read candidates", async () => {
    const result = await listCandidates(accessOf("u_krit"), { position: "พนักงานขาย ขอนแก่น", stage: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result).toHaveProperty("code", "PERMISSION_DENIED");
  });
});

describe("courses", () => {
  test("every course cover exists", () => {
    for (const course of COURSES) expect(existsSync(join(process.cwd(), "public", course.cover))).toBe(true);
  });

  test("this month's courses tell HR who should renew a forklift licence", async () => {
    const result = await listCourses(accessOf("u_may"), { month: "2026-09", query: null });
    const forklift = result.data.find((row) => row.id === "crs_forklift_kk");
    expect(forklift?.note).toContain("คุณแดง");
    expect(result.data.every((row) => row.cover.startsWith("/img/courses/"))).toBe(true);
  });

  test("a rep sees his own licence expiring on the renewal course and can ask for a seat once", async () => {
    const access = accessOf("u_krit");
    const row = (await listCourses(access, { month: "2026-10", query: null })).data.find((entry) => entry.id === "crs_sales_licence");
    expect(row?.badges.some((badge) => badge.tone === "danger")).toBe(true);
    expect((await listCourses(access, { month: null, query: null })).data[0]?.id).toBe("crs_sales_licence");
    expect(row?.place).toBe("ออนไลน์");
    const before = new Set(staffRequests().all().map((entry) => entry.id));
    const first = await enrollCourse(access, "crs_sales_licence", null);
    if (!first.ok) throw new Error(first.error);
    requested.push(...staffRequests().where((entry) => !before.has(entry.id)).map((entry) => entry.id));
    expect(first.data.approver).toBe("คุณอนุชา พรหมศรี");
    expect((await enrollCourse(access, "crs_sales_licence", null)).ok).toBe(false);
  });

  test("a full course refuses a seat", async () => {
    expect((await enrollCourse(accessOf("u_may"), "crs_gmp", null)).ok).toBe(false);
  });
});

async function pendingAnnualDays(access: ReturnType<typeof accessOf>): Promise<number> {
  const match = (await policyFor(access, "leave")).data.balances[0]?.detail.match(/รออนุมัติ (\d+)/);
  return match ? Number(match[1]) : 0;
}

describe("leave", () => {
  test("working days skip weekends", async () => {
    expect(workdaysBetween("2026-10-02", "2026-10-05", calendarOf(await ports().calendar.load()))).toBe(2);
  });

  test("the leave policy carries the viewer's balances and the form", async () => {
    const result = await policyFor(accessOf("u_krit"), "leave");
    expect(result.data.balances).toHaveLength(3);
    expect(result.data.form?.approver).toBe("คุณอนุชา พรหมศรี");
    expect(result.data.sections.length).toBeGreaterThan(0);
  });

  test("annual leave needs three working days' notice", async () => {
    const result = await requestLeave(accessOf("u_krit"), { kind: "annual", from: "2026-09-23", to: "2026-09-23", reason: "" }, null);
    expect(result.ok).toBe(false);
  });

  test("annual leave beyond the balance is refused", async () => {
    const result = await requestLeave(accessOf("u_krit"), { kind: "annual", from: "2026-10-05", to: "2026-10-23", reason: "" }, null);
    expect(result.ok).toBe(false);
  });

  test("a valid request lands in the manager's Inbox and reduces the balance", async () => {
    const access = accessOf("u_krit");
    const before = new Set(staffRequests().all().map((entry) => entry.id));
    const pendingBefore = await pendingAnnualDays(access);
    const result = await requestLeave(access, { kind: "annual", from: "2026-10-01", to: "2026-10-02", reason: "พาครอบครัวไปต่างจังหวัด" }, null);
    if (!result.ok) throw new Error(result.error);
    const request = staffRequests().where((entry) => !before.has(entry.id))[0];
    if (request) requested.push(request.id);
    expect(result.data.days).toBe(2);
    expect(request ? packets().get(request.packetId)?.toUserId : null).toBe("u_anucha");
    expect((await pendingAnnualDays(access))).toBe(pendingBefore + 2);
  });
});
