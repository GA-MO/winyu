import { describe, expect, test } from "bun:test";
import { diffOf, sessionOf, shiftFor, shifted, type SessionWindow } from "./records";

const SESSIONS: SessionWindow[] = [
  { userId: "u_a", threadId: "t_a", daysAgo: 3, startedAt: "2026-09-25T10:00:00.000Z", endedAt: "2026-09-25T10:02:00.000Z" },
  { userId: "u_b", threadId: "t_b", daysAgo: 9, startedAt: "2026-09-25T10:01:00.000Z", endedAt: "2026-09-25T10:03:00.000Z" },
];

describe("simulation records", () => {
  test("a diff tells created records from changed ones and keeps the earlier copy", () => {
    const before = { events: { e1: { id: "e1", at: "x" } }, layouts: { u_a: { id: "u_a", version: 1 } } };
    const after = { events: { e1: { id: "e1", at: "x" }, e2: { id: "e2", at: "y" } }, layouts: { u_a: { id: "u_a", version: 2 } } };
    const diff = diffOf(before, after);
    expect(diff.created).toEqual({ events: ["e2"] });
    expect(diff.modified.layouts?.u_a?.version).toBe(1);
  });

  test("a record joins its thread first, then its user, then whoever was running at that moment", () => {
    expect(sessionOf("threads", { id: "t_b" }, SESSIONS)?.threadId).toBe("t_b");
    expect(sessionOf("audit", { id: "a1", threadId: "t_a", at: "2026-09-25T10:02:30.000Z" }, SESSIONS)?.userId).toBe("u_a");
    expect(sessionOf("model-calls", { id: "m1", userId: "u_b", at: "2026-09-25T10:01:30.000Z" }, SESSIONS)?.userId).toBe("u_b");
    expect(sessionOf("notifications", { id: "n1", toUserId: "u_z", at: "2026-09-25T10:00:30.000Z" }, SESSIONS)?.userId).toBe("u_a");
    expect(sessionOf("events", { id: "e1", userId: "u_a", at: "2026-09-24T10:00:00.000Z" }, SESSIONS)).toBeNull();
    expect(sessionOf("packets", { id: "p1", fromUserId: "u_b", toUserId: "u_a", createdAt: "2026-09-25T10:01:30.000Z" }, SESSIONS)?.userId).toBe("u_b");
    expect(sessionOf("notifications", { id: "n2", userId: "u_a", at: "2026-09-25T10:02:40.000Z" }, SESSIONS)?.userId).toBe("u_b");
  });

  test("shifting moves every instant back by the session's days and leaves plain dates alone", () => {
    const moved = shifted({ at: "2026-09-25T10:00:00.000Z", range: { from: "2026-09-01", to: "2026-09-22" }, thread: [{ at: "2026-09-25T11:00:00.000Z" }] }, shiftFor(SESSIONS[0]));
    expect(moved.at).toBe("2026-09-22T10:00:00.000Z");
    expect(moved.range).toEqual({ from: "2026-09-01", to: "2026-09-22" });
    expect(moved.thread[0]?.at).toBe("2026-09-22T11:00:00.000Z");
  });
});
