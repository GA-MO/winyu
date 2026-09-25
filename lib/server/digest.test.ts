import { describe, expect, test } from "bun:test";
import type { AccessContext } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { outbox } from "./agent/collections";
import { isGrounded, type Narrator } from "./digest-narrator";
import { digestFor, runDigestJob } from "./digest";
import { feedFor } from "./feed";

const NOW = Date.parse("2026-09-25T00:07:00.000Z");

function access(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return liveAccessFor(user);
}

describe("the morning digest reads the feed", () => {
  test("HR hears about people now, not only people who get alerts", async () => {
    const digest = await digestFor(access("u_may"), null, NOW);
    expect(digest.count).toBeGreaterThan(0);
    expect(digest.lines[0]).toContain("คุณแดง ศักดิ์ดี");
    expect(digest.lines.length).toBeLessThanOrEqual(6);
  });

  test("what was told is not told again, unless it turned red", async () => {
    const hr = access("u_may");
    const first = await digestFor(hr, null, NOW);
    const again = await digestFor(hr, { keys: first.keys, tones: first.tones }, NOW);
    expect(again.count).toBe(0);
    const red = first.keys.find((key) => first.tones[key] === "danger");
    if (!red) throw new Error("expected a red matter on HR's feed");
    const turned = await digestFor(hr, { keys: first.keys, tones: { ...first.tones, [red]: "warning" } }, NOW);
    expect(turned.count).toBe(1);
  });

  test("never mentions low-severity alerts", async () => {
    const ceo = access("u_thana");
    const low = new Set((await feedFor(ceo, NOW)).filter((item) => item.source === "alert" && item.tone === "info").map((item) => item.key));
    const digest = await digestFor(ceo, null, NOW);
    expect(digest.keys.some((key) => low.has(key))).toBe(false);
  });

  test("a narrator writes the lead and the order, never the lines", async () => {
    const reversed: Narrator = async (_who, lines) => ({ lead: "เริ่มที่เรื่องใบอนุญาตก่อน", order: [...lines].reverse().map((line) => line.id) });
    const plain = await digestFor(access("u_may"), null, NOW);
    const told = await digestFor(access("u_may"), null, NOW, reversed);
    expect(told.lead).toBe("เริ่มที่เรื่องใบอนุญาตก่อน");
    expect([...told.lines].sort()).toEqual([...plain.lines].sort());
    expect(told.lines[0]).toBe(plain.lines[Math.min(plain.count, 5) - 1]);
  });

  test("a lead with a number the lines do not hold is not grounded", () => {
    const lines = [{ id: "d1", text: "คุณแดง ศักดิ์ดี · ใบขับขี่รถยก 8 วัน" }];
    expect(isGrounded("ใบขับขี่รถยกของคุณแดงเหลือ 8 วัน", lines)).toBe(true);
    expect(isGrounded("ใบขับขี่รถยกของคุณแดงเหลือ 3 วัน", lines)).toBe(false);
    expect(isGrounded("ดูที่ https://example.com", lines)).toBe(false);
  });

  test("the job sends HR a digest with the narrator's lead", async () => {
    const lead: Narrator = async () => ({ lead: "เช้านี้เริ่มที่คุณแดง", order: [] });
    await runDigestJob(new Date(NOW), lead);
    const mail = outbox().all().find((entry) => entry.kind === "digest" && entry.toUserId === "u_may");
    expect(mail?.body.startsWith("เช้านี้เริ่มที่คุณแดง")).toBe(true);
  });
});
