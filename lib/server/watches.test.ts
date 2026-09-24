import { afterAll, describe, expect, test } from "bun:test";
import type { AccessContext, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { memoryFacts, notifications, outbox, personalWatches } from "@/lib/server/agent/collections";
import { createWatch, removeWatch, runWatchJob, watchesOf } from "./watches";

function access(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

const PLANNER = access("u_wee");
const NORTH_REP = access("u_ploy");
const created: string[] = [];
const MEMORY_BEFORE = memoryFacts().where((fact) => fact.userId === "u_wee");

const COVER_LAMPHUN: MetricQuery = { metric: "days_of_cover", dims: ["dc", "sku"], filters: { dc: ["dc_lamphun"] }, range: { from: "2026-09-16", to: "2026-09-22" }, grain: "day", compare: "none", limit: null };
const NORTHEAST_SALES: MetricQuery = { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-09-16", to: "2026-09-22" }, grain: "day", compare: "prev_period", limit: null };

afterAll(() => {
  const kept = new Set(MEMORY_BEFORE.map((fact) => fact.id));
  for (const fact of memoryFacts().where((entry) => entry.userId === "u_wee" && !kept.has(entry.id))) memoryFacts().remove(fact.id);
  for (const fact of MEMORY_BEFORE) memoryFacts().put(fact);
  for (const id of created) {
    personalWatches().remove(id);
    for (const note of notifications().where((entry) => entry.refId === id)) notifications().remove(note.id);
    for (const mail of outbox().where((entry) => entry.refId === id)) outbox().remove(mail.id);
  }
});

describe("standing watches", () => {
  test("a watch over the line is stored as already triggered, and says where", async () => {
    const result = await createWatch(PLANNER, { title: "สต๊อกดีซีลำพูน", query: COVER_LAMPHUN, condition: { kind: "below", value: 10 } });
    if (!result.ok) throw new Error(result.error);
    created.push(result.watch.id);
    expect(result.watch.state).toBe("triggered");
    expect(result.now).toContain("ลำพูน");
    expect(result.now).toContain("เพอร์ร่า");
    expect(watchesOf(PLANNER.userId).some((watch) => watch.id === result.watch.id)).toBe(true);
    expect(memoryFacts().where((fact) => fact.userId === PLANNER.userId && fact.type === "preference" && fact.value.includes("ต่ำกว่า 10 วัน")).length).toBe(1);
  });

  test("a watch outside the user's scope is refused and not stored", async () => {
    const before = personalWatches().all().length;
    const result = await createWatch(NORTH_REP, { title: "อีสาน", query: NORTHEAST_SALES, condition: { kind: "change", value: 10 } });
    expect(result.ok).toBe(false);
    expect(personalWatches().all().length).toBe(before);
  });

  test("the job tells the owner once when a watch crosses, not again while it stays over", async () => {
    const result = await createWatch(PLANNER, { title: "สต๊อกดีซีลำพูน รอบ 2", query: COVER_LAMPHUN, condition: { kind: "below", value: 10 } });
    if (!result.ok) throw new Error(result.error);
    created.push(result.watch.id);
    personalWatches().put({ ...result.watch, state: "ok" });
    await runWatchJob();
    await runWatchJob();
    expect(notifications().where((entry) => entry.refId === result.watch.id)).toHaveLength(1);
    expect(outbox().where((entry) => entry.refId === result.watch.id && entry.toUserId === PLANNER.userId)).toHaveLength(1);
  });

  test("only the owner can remove a watch", () => {
    const id = created[0] as string;
    expect(removeWatch(NORTH_REP.userId, id)).toBe(false);
    expect(personalWatches().get(id)).not.toBeNull();
  });
});
