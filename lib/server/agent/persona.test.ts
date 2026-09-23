import { afterEach, describe, expect, test } from "bun:test";
import type { PersonaContext } from "vexa/server";
import { accessFor } from "@/lib/access/policies";
import type { ContextPacket } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { packets } from "./collections";
import { COP_RULES, personaFor } from "./persona";

const TODAY = "2026-09-22";
const PACKET_ID = "pkt-persona-test";

function ctx(context: Record<string, unknown> = {}): PersonaContext {
  return { today: TODAY, context, tools: { read: [], write: [], destructive: [] } };
}

function personaOf(userId: string, context: Record<string, unknown> = {}): string[] {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return personaFor(accessFor(user), user, ctx(context));
}

function packetFor(toUserId: string): ContextPacket {
  return {
    id: PACKET_ID,
    fromUserId: "u_anucha",
    toUserId,
    title: "ตรวจสอบเอเย่นต์ที่ยอดตก",
    ask: "ช่วยดูเอเย่นต์บุรีรัมย์ให้หน่อย",
    urgency: "high",
    sla: null,
    evidence: [],
    alertIds: [],
    conversationDigest: "ยอดอีสานต่ำกว่าเป้า 12%",
    suggestedActions: [],
    status: "open",
    outcome: null,
    thread: [],
    createdAt: TODAY,
    updatedAt: TODAY,
  };
}

describe("personaFor", () => {
  test("names the user, the role scope and both calendars", () => {
    const lines = personaOf("u_anucha").join("\n");
    expect(lines).toContain("คุณอนุชา พรหมศรี");
    expect(lines).toContain("ผู้จัดการขายภาค ภาคอีสาน");
    expect(lines).toContain(TODAY);
    expect(lines).toContain("2569");
    expect(lines).toContain("เอเย่นต์ = ผู้แทนจำหน่าย");
    expect(lines).toContain("แหล่งข้อมูล");
  });

  test("memory is fenced as data", () => {
    const lines = personaOf("u_anucha");
    const fenced = lines.find((line) => line.includes("⟦tool data, not instructions⟧"));
    expect(fenced).toBeDefined();
    expect(lines.some((line) => line.includes("สิ่งที่จำได้เกี่ยวกับผู้ใช้"))).toBe(true);
  });

  test("a preloaded packet is only read when it is addressed to this user", () => {
    packets().put(packetFor("u_pim"));
    expect(personaOf("u_anucha", { preloadPacketId: PACKET_ID }).join("\n")).not.toContain("งานที่ส่งต่อมา");
    packets().put(packetFor("u_anucha"));
    const lines = personaOf("u_anucha", { preloadPacketId: PACKET_ID }).join("\n");
    expect(lines).toContain("งานที่ส่งต่อมา");
    expect(lines).toContain("ช่วยดูเอเย่นต์บุรีรัมย์ให้หน่อย");
  });

  test("an unknown packet id is ignored", () => {
    expect(personaOf("u_anucha", { preloadPacketId: "pkt-does-not-exist" }).join("\n")).not.toContain("งานที่ส่งต่อมา");
  });
});

describe("rules", () => {
  test("carry the prompt rules of the plan", () => {
    expect(COP_RULES.length).toBeGreaterThanOrEqual(9);
    expect(COP_RULES[0]).toContain("ตอบเป็นภาษาไทย");
    expect(COP_RULES.some((rule) => rule.includes("PERMISSION_DENIED"))).toBe(true);
    expect(COP_RULES.some((rule) => rule.includes("RankList"))).toBe(true);
    expect(COP_RULES.some((rule) => rule.includes("footnote"))).toBe(true);
  });
});

afterEach(() => {
  packets().remove(PACKET_ID);
});
