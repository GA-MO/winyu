import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Alert } from "@/lib/contracts";
import { addDays, DATA_AS_OF } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { MatterGoal } from "@/lib/share/matter";
import { alerts, notifications } from "@/lib/server/agent/collections";
import { runWatchJob } from "@/lib/server/watches";
import { actOnMatter } from "./act";
import { createShare } from "./deliver";
import { goalMet, goalOf, goalReading, onLatestDay } from "./goal";
import { shares } from "./shares";

setDefaultTimeout(60_000);

const TARGET_READ = { metric: "net_sales_volume", dims: [], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null };
const TARGET_CARD = { kind: "tool" as const, reads: [{ tool: "query_metric", input: TARGET_READ }] };
const made: string[] = [];

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

async function matterOnPath(): Promise<string> {
  const outcome = await createShare(user("u_thana"), { card: TARGET_CARD, question: null, ask: "ช่วยดูอีสานหน่อย", intent: "act", recipients: [{ userId: "u_anucha", channel: "winyu" }] });
  if (!outcome.ok) throw new Error(outcome.error);
  made.push(outcome.share.id);
  actOnMatter(user("u_anucha"), outcome.share.id, { kind: "pass_on", toUserId: "u_krit" });
  return outcome.share.id;
}

async function withGoalAround(code: string, offset: number): Promise<MatterGoal> {
  const total: MatterGoal = { query: { ...TARGET_READ, compare: "none" }, measure: "total", line: 0, reach: "at_least" };
  const reading = await goalReading(total, user("u_thana"));
  if (reading === null) throw new Error("the goal's read returned nothing");
  const goal = { ...total, line: reading + offset };
  const stored = shares().get(code);
  if (!stored) throw new Error("matter missing");
  shares().put({ ...stored, goal });
  return goal;
}

function goalNotes(userId: string, code: string) {
  return notifications().where((note) => note.userId === userId && note.refId === code && note.title === TH.notify.matterUpdate.goal_met("", shares().get(code)?.title ?? ""));
}

afterAll(() => {
  for (const code of made) {
    shares().remove(code);
    for (const note of notifications().where((entry) => entry.refId === code)) notifications().remove(note.id);
  }
});

describe("the goal a matter is sent with", () => {
  test("a card against target closes when attainment reaches 100%; a card with neither a target nor an alert has no goal", () => {
    expect(goalOf(TARGET_CARD, [])).toMatchObject({ measure: "attainment", line: 100, reach: "at_least" });
    expect(goalOf({ kind: "tool", reads: [{ tool: "query_metric", input: { ...TARGET_READ, compare: "prev_period" } }] }, [])).toBeNull();
  });

  test("a matter about an open alert closes when the number is back where it was expected, from the side it left", () => {
    const alert = { id: "al_goal_test", metric: "net_sales_volume", dims: { agent: "ag_nea_05" }, window: { from: "2026-11-13", to: "2026-11-26" }, observed: 2220, expected: 12928, direction: "down", status: "open" } as unknown as Alert;
    alerts().put(alert);
    try {
      expect(goalOf(TARGET_CARD, [alert.id])).toMatchObject({ measure: "total", line: 12928, reach: "at_least", query: { metric: "net_sales_volume", filters: { agent: ["ag_nea_05"] } } });
      expect(goalMet({ query: {}, measure: "total", line: 12928, reach: "at_least" }, 13000)).toBe(true);
      expect(goalMet({ query: {}, measure: "total", line: 12928, reach: "at_least" }, 2220)).toBe(false);
    } finally {
      alerts().remove(alert.id);
    }
  });

  test("its read is checked on the latest data day: dates keep their length and end on DATA_AS_OF, a named period resolves on today's clock", () => {
    const earlier = { metric: "net_sales_volume", dims: [], filters: {}, range: { from: addDays(DATA_AS_OF, -40), to: addDays(DATA_AS_OF, -30) }, grain: "day", compare: "none", limit: null } as const;
    expect(onLatestDay(earlier).range).toEqual({ from: addDays(DATA_AS_OF, -10), to: DATA_AS_OF });
    const named = { ...earlier, range: null, period: "this_month" } as const;
    expect(onLatestDay(named)).toEqual(named);
  });
});

describe("the hourly watch job closes a matter that reached its goal", () => {
  test("with the goal just below the current number, one run closes it, and the sender and everyone on the path hear it exactly once", async () => {
    const code = await matterOnPath();
    await withGoalAround(code, -1);
    const result = await runWatchJob(new Date());
    expect(result.mattersClosed).toBeGreaterThanOrEqual(1);
    const closed = shares().get(code);
    expect(closed?.status).toBe("done");
    expect(closed?.thread.at(-1)).toMatchObject({ kind: "goal_met", userId: null });
    for (const person of ["u_thana", "u_anucha", "u_krit"]) expect(goalNotes(person, code)).toHaveLength(1);

    await runWatchJob(new Date());
    for (const person of ["u_thana", "u_anucha", "u_krit"]) expect(goalNotes(person, code)).toHaveLength(1);
  });

  test("a goal not reached leaves the matter open and tells nobody", async () => {
    const code = await matterOnPath();
    await withGoalAround(code, 1_000_000_000);
    await runWatchJob(new Date());
    expect(shares().get(code)?.status).toBe("open");
    for (const person of ["u_thana", "u_anucha", "u_krit"]) expect(goalNotes(person, code)).toHaveLength(0);
  });
});
