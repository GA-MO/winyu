import { afterAll, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { visits } from "@/lib/server/agent/collections";
import { changesSince } from "./briefing";
import { markVisit } from "./visits";

const USER = findUser("u_anucha");
if (!USER) throw new Error("missing demo user u_anucha");
const ACCESS = accessFor(USER);
const SAVED = visits().get(ACCESS.userId);
const T0 = Date.parse("2026-10-01T08:00:00.000Z");
const MINUTE = 60_000;

afterAll(() => {
  if (SAVED) visits().put(SAVED);
  else visits().remove(ACCESS.userId);
});

describe("what is new since the user last looked", () => {
  test("the first visit has nothing to compare with, so nothing is called new", async () => {
    visits().remove(ACCESS.userId);
    expect(markVisit(ACCESS, [], T0)).toBeNull();
    expect((await changesSince(ACCESS, null)).some((change) => change.metric === null)).toBe(false);
  });

  test("a reload inside half an hour is the same visit", () => {
    expect(markVisit(ACCESS, [], T0 + 10 * MINUTE)).toBeNull();
  });

  test("a later visit compares with what was open last time", async () => {
    const stored = visits().get(ACCESS.userId);
    if (!stored) throw new Error("visit not stored");
    const [first, ...rest] = stored.alertIds;
    visits().put({ ...stored, alertIds: rest });
    const baseline = markVisit(ACCESS, [], T0 + 3 * 60 * MINUTE);
    expect(baseline?.alertIds.has(first as string)).toBe(false);
    const fresh = (await changesSince(ACCESS, baseline)).find((change) => change.metric === null);
    expect(fresh?.label).toContain("1 เรื่อง");
  });
});
