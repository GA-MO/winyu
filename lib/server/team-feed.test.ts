import { describe, expect, test } from "bun:test";
import type { AccessContext } from "@/lib/contracts";
import { handoffSwitch, liveAccessFor, setHandoffEnabled } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { landingStatusLead } from "./dashboard";
import { feedFor, landingFeedFor, todoFor } from "./feed";

const NOW = Date.parse("2026-09-25T09:00:00.000Z");

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return liveAccessFor(user);
}

describe("a manager reads a report's region as one story", () => {
  test("only someone whose alerts all sit below them reads them as their team's", () => {
    expect(landingStatusLead(accessOf("u_prasit"))).toBe("ในทีมของคุณ");
    expect(landingStatusLead(accessOf("u_krit"))).toBe("รอคุณอยู่");
    expect(landingStatusLead(accessOf("u_oat"))).toBe("รอคุณอยู่");
  });

  test("the director's north-east matters fold into one card that ties the silent agents to the empty sales seats", async () => {
    const director = accessOf("u_prasit");
    const [card] = (await landingFeedFor(director, NOW)).cards;
    expect(card?.title).toBe("ภาคอีสาน · คุณอนุชา พรหมศรี");
    expect(card?.body).toContain("อุบลราชธานี ว่าง 99 วัน");
    expect(card?.body).toContain("ขอนแก่น ว่าง 64 วัน");
    expect(card?.lesson).toContain("คุณอนุชา");
    const todo = await todoFor(director, NOW);
    expect(todo.filter((item) => item.source === "team")).toHaveLength(1);
    expect(todo.some((item) => item.source === "opening" || item.label.startsWith("อุบลศรีสุข"))).toBe(false);
  });

  test("one level up the same story names the region, the report to ask, and the owner who holds it", async () => {
    const ceo = accessOf("u_thana");
    const team = (await feedFor(ceo, NOW)).find((item) => item.source === "team");
    expect(team?.label).toBe("ภาคอีสาน · คุณประสิทธิ์ ชัยภูมิ");
    expect(team?.detail).toContain("คุณอนุชา");
  });

  test("the owner's own feed is untouched, and asking for progress is offered only while handoff is on", async () => {
    expect((await feedFor(accessOf("u_anucha"), NOW)).some((item) => item.source === "team")).toBe(false);
    const before = handoffSwitch();
    setHandoffEnabled(true, "u_ton");
    try {
      const [card] = (await landingFeedFor(accessOf("u_prasit"), NOW)).cards;
      expect(card?.handoff?.input).toMatchObject({ toUserId: "u_anucha" });
      setHandoffEnabled(false, "u_ton");
      const [closed] = (await landingFeedFor(accessOf("u_prasit"), NOW)).cards;
      expect(closed?.handoff).toBeNull();
    } finally {
      if (before) setHandoffEnabled(before.enabled, before.by);
    }
  });
});
