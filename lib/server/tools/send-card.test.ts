import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { ScreenCards, ShareTarget } from "@/lib/share/card";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import { shares } from "@/lib/server/share/shares";
import { approvedCallId } from "@/scripts/approved-call";
import { onScreen, screenWith } from "@/scripts/screen-cards";
import { addDays, businessToday } from "@/lib/data/dates";

setDefaultTimeout(60_000);

const CEO = "u_thana";
const NORTHEAST = { metric: "net_sales_volume", dims: ["province"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null };
const BY_REGION = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null };
const ON_SCREEN: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: NORTHEAST }] }, question: "ยอดอีسานรายจังหวัดเทียบเป้า" };
const MODEL_INSTRUCTION = /ถามผู้ใช้|เรียกใหม่|บอกผู้ใช้|ห้าม/;

type Sent = { ok: boolean; code?: string; error?: string; data?: { code: string; intent: string; urgency: string; due: string | null; warning: string | null; goal: string | null } };

function turn(question: string, screen: ScreenCards): TurnContext {
  return { turnId: randomUUID(), threadId: null, question, queries: [], screenCards: async () => screen };
}

async function send(input: Record<string, unknown>, question = "ส่งการ์ดนี้ให้หน่อย", screen: ScreenCards = screenWith([ON_SCREEN]), from = CEO): Promise<Sent> {
  const user = findUser(from);
  if (!user) throw new Error(`no ${from}`);
  const tool = winyuTools().send_card;
  const result = await runWithAccess(liveAccessFor(user), () => runWithTurn(turn(question, screen), () => tool.execute(input, { toolCallId: approvedCallId(from, "send_card") })));
  return result as Sent;
}

function matterOf(sent: Sent) {
  const code = sent.data?.code;
  if (!sent.ok || !code) throw new Error(`not sent: ${sent.error ?? ""}`);
  return shares().get(code);
}

function sentCount(): number {
  return shares().where((matter) => matter.senderId === CEO).length;
}

describe("send_card", () => {
  test("พี่อนุชา, น้องกฤต and คุณ… resolve to the colleague they name", async () => {
    expect(matterOf(await send({ to: ["พี่อนุชา"] }))?.path.map((hop) => hop.userId)).toEqual(["u_anucha"]);
    expect(matterOf(await send({ to: ["น้องกฤต"] }))?.path.map((hop) => hop.userId)).toEqual(["u_krit"]);
  });

  test("with nobody named it goes to the card's owner, asks for an answer with a drafted ask, and closes on its target", async () => {
    const sent = await send({});
    const matter = matterOf(sent);
    expect(matter?.path.map((hop) => hop.userId)).toEqual(["u_anucha"]);
    expect(matter).toMatchObject({ intent: "act", ask: TH.share.askDraft("ปริมาณขายเข้า (Sell-in) · รายจังหวัด"), card: ON_SCREEN.card, question: ON_SCREEN.question });
    expect(matter?.goal).toMatchObject({ kind: "attainment", atLeast: 100 });
    expect(sent.data?.goal).not.toBeNull();
  });

  test("a card a pressed button carries is the one sent, not the one on screen", async () => {
    const matter = matterOf(await send({ to: ["u_anucha"], card: { reads: [{ tool: "query_metric", input: BY_REGION }] } }));
    expect(matter?.card.reads[0]?.input).toMatchObject({ metric: "net_sales_value", dims: ["region"] });
  });

  test("several people only look at it: a matter that waits on an answer goes to one person", async () => {
    expect(matterOf(await send({ to: ["คุณอนุชา", "คุณกฤต"], ask: "ดูไว้ก่อน" }))?.intent).toBe("fyi");
  });

  test("urgency comes from the person's words, never from the model alone", async () => {
    expect((await send({ to: ["u_anucha"], urgency: "now" }, "ฝากดูภายในสัปดาห์")).data?.urgency).toBe("this_week");
    expect((await send({ to: ["u_anucha"], urgency: "now" }, "ฝากดูหน่อย")).data?.urgency).toBe("today");
    expect((await send({ to: ["u_anucha"] }, "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน")).data?.urgency).toBe("now");
  });

  test("the deadline the sender wrote is the matter's due day: ภายในพรุ่งนี้ is tomorrow, not today", async () => {
    const sent = await send({ to: ["u_anucha"], ask: "โทรตามหนี้แล้วตอบกลับมา" }, "โทรตามหนี้วารินพาณิชย์ภายในพรุ่งนี้ แล้วตอบกลับมา");
    const tomorrow = addDays(businessToday(), 1);
    expect(sent.data).toMatchObject({ due: tomorrow, urgency: "this_week" });
    expect(matterOf(sent)?.due).toBe(tomorrow);
  });

  test("an ask the card refutes is held back with the card's figure while nobody has seen it, and goes with the sheet's warning once they have", async () => {
    const claim = { to: ["u_anucha"], ask: "เดือนนี้อีสานจะปิดเกินเป้าแน่นอน" };
    const question = "บอกพี่อนุชาว่าเดือนนี้อีสานจะปิดเกินเป้าแน่นอน";
    const before = sentCount();
    const held = await send(claim, question);
    expect(held).toMatchObject({ ok: false, code: "ASK_CONTRADICTS_CARD" });
    expect(held.error ?? "").toMatch(/^ยังไม่ได้ส่ง: ข้อความบอกว่าถึงหรือเกินเป้า แต่การ์ดแสดง \d+\.\d% ของเป้า$/);
    expect(sentCount()).toBe(before);
    const sent = await send(claim, question, screenWith([ON_SCREEN], true));
    expect(sent.ok).toBe(true);
    expect(sent.data?.warning ?? "").toMatch(/^ข้อความบอกว่าถึงหรือเกินเป้า แต่การ์ดแสดง \d+\.\d% ของเป้า$/);
  });

  test("the card named by its ref is the one sent; with two cards on screen and none named, or a ref nobody drew, nothing is sent and the cards on screen are listed", async () => {
    const byRegion: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] }, question: "ยอดขายแยกตามภาค" };
    const two = screenWith([ON_SCREEN, byRegion]);
    const named = await send({ to: ["u_anucha"], cardRef: onScreen(byRegion).ref }, "ส่งการ์ดยอดขายแยกตามภาคให้พี่อนุชา", two);
    expect(matterOf(named)?.card).toEqual(byRegion.card);
    const unclear = await send({ to: ["u_anucha"] }, "ส่งการ์ดนี้ให้พี่อนุชา", two);
    const unknown = await send({ to: ["u_anucha"], cardRef: "c0000" }, "ส่งการ์ดนี้ให้พี่อนุชา", two);
    expect([unclear.code, unknown.code]).toEqual(["CARD_UNCLEAR", "CARD_UNKNOWN"]);
    for (const refused of [unclear, unknown]) {
      expect(refused.error ?? "").toContain(onScreen(ON_SCREEN).ref);
      expect(refused.error ?? "").toContain(onScreen(byRegion).ref);
      expect(refused.error ?? "").not.toMatch(MODEL_INSTRUCTION);
    }
  });

  test("a lookup is never sent, even when a call carries its reads as the card", async () => {
    const before = sentCount();
    const profile = await send({ to: ["u_anucha"], card: { reads: [{ tool: "get_person", input: { id: "u_krit" } }] } }, "ส่งโปรไฟล์ให้พี่อนุชา");
    const master = await send({ to: ["u_arm"], card: { reads: [{ tool: "describe_entity", input: { query: "สงขลาทักษิณ เทรดดิ้ง", kind: "agent" } }] } }, "ไปตามเก็บหนี้");
    expect([profile.code, master.code]).toEqual(["NOT_SHAREABLE", "NOT_SHAREABLE"]);
    expect(sentCount()).toBe(before);
  });

  test("a name nobody has, a name several people have, no card, or numbers the person never typed: nothing is sent, and the reason reads as a fact, never as an instruction to the model", async () => {
    const before = sentCount();
    const refusals = [
      await send({ to: ["พี่สมศรี"] }),
      await send({ to: ["จันทร"] }),
      await send({ to: ["u_anucha"] }, "ส่งการ์ดนี้", screenWith([])),
      await send({ to: ["u_anucha"], ask: "ยอดต่ำกว่าเป้า 12%" }, "ส่งการ์ดนี้ให้พี่อนุชา"),
    ];
    expect(refusals.map((result) => result.code)).toEqual(["UNRESOLVED_RECIPIENT", "UNRESOLVED_RECIPIENT", "NO_CARD", "ASK_CARRIES_NUMBERS"]);
    expect(sentCount()).toBe(before);
    for (const refusal of refusals) expect(refusal.error ?? "").not.toMatch(MODEL_INSTRUCTION);
    expect(refusals[0].error).toBe(TH.share.chat.unknown("พี่สมศรี"));
  });
});
