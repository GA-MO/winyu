import { afterEach, describe, expect, mock, test } from "bun:test";

const USER = "u_nattaya";
const SOUTH = 'เรียกภาคใต้ว่า "ด้ามขวาน"';
let signedIn: string | null = USER;

const { sessionCookie } = await import("@/lib/server/auth/session-token");
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (signedIn ? { name, value: sessionCookie({ via: "demo", userId: signedIn }).value } : undefined) }),
}));

const { DELETE } = await import("@/app/api/memory/[id]/route");
const { memoryFacts } = await import("@/lib/server/agent/collections");
const { forgetAll, learnExtracted } = await import("./memory");

function deleteFact(id: string): Promise<Response> {
  return DELETE(new Request(`http://localhost/api/memory/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
}

function mine() {
  return memoryFacts().where((fact) => fact.userId === USER);
}

afterEach(() => {
  signedIn = USER;
  forgetAll(USER);
});

describe("deleting a fact on the memory page", () => {
  test("the deleted fact is not learned again when the next question says the same thing", async () => {
    const [fact] = learnExtracted(USER, [{ type: "vocabulary", value: SOUTH, asked: true }], "thread_a");
    if (!fact) throw new Error("the fact was not stored");
    expect((await deleteFact(fact.id)).status).toBe(200);
    expect(learnExtracted(USER, [{ type: "vocabulary", value: SOUTH }], "thread_b")).toEqual([]);
    expect(learnExtracted(USER, [{ type: "vocabulary", value: SOUTH }], "thread_c")).toEqual([]);
    expect(mine()).toEqual([]);
  });

  test("someone else's fact cannot be deleted", async () => {
    const [fact] = learnExtracted(USER, [{ type: "vocabulary", value: SOUTH, asked: true }], "thread_a");
    signedIn = "u_anucha";
    expect((await deleteFact(fact?.id ?? "")).status).toBe(404);
    expect(mine()).toHaveLength(1);
  });
});
