import { afterEach, describe, expect, test } from "bun:test";
import { notifications } from "@/lib/server/agent/collections";
import { markAllRead, markOneRead, notify } from "./notify";

const made: string[] = [];

function share(to: string, from: string | null) {
  const stored = notify(to, from, { kind: "share", refId: "code", senderName: "คุณธนา", cardTitle: "ยอดขาย", grantUntil: null });
  made.push(stored.id);
  return stored;
}

afterEach(() => {
  for (const id of made.splice(0)) notifications().remove(id);
});

describe("notify", () => {
  test("keeps who caused a notification, and nobody when Winyu did", () => {
    expect(notifications().get(share("u_krit", "u_thana").id)?.fromUserId).toBe("u_thana");
    expect(notifications().get(share("u_krit", null).id)?.fromUserId).toBeUndefined();
  });

  test("opening one notification reads only that one, and never someone else's", () => {
    const opened = share("u_krit", "u_thana");
    const other = share("u_krit", "u_thana");
    const notMine = share("u_wee", "u_thana");
    markOneRead("u_krit", opened.id);
    markOneRead("u_krit", notMine.id);
    expect(notifications().get(opened.id)?.read).toBe(true);
    expect(notifications().get(other.id)?.read).toBe(false);
    expect(notifications().get(notMine.id)?.read).toBe(false);
  });

  test("reading all reads every notification of that person only", () => {
    const mine = share("u_krit", "u_thana");
    const theirs = share("u_wee", "u_thana");
    markAllRead("u_krit");
    expect(notifications().get(mine.id)?.read).toBe(true);
    expect(notifications().get(theirs.id)?.read).toBe(false);
  });
});
