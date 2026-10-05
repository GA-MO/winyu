import { beforeAll, describe, expect, mock, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { answerChannel } = await import("./answer");
const { channelThreadId } = await import("./thread-id");
const { linkIdentity, pendingAttempt, identityKey } = await import("@/lib/server/identity");
const { auditLog } = await import("@/lib/server/audit");
const { threads } = await import("@/lib/server/threads-read");
const { watchesOf } = await import("@/lib/server/watches");

const TENANT = "11111111-2222-4333-8444-555555555555";
const WEB = "https://winyu.example.com";
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const WATCH = {
  condition: { kind: "below", value: 10 },
  query: { where: null, filters: { dc: "dc_lamphun" }, range: { to: "2026-09-22", from: "2026-09-22" }, metric: "days_of_cover", sort: "value_asc", grain: "day", limit: 10, dims: ["dc"], compare: "none" },
  title: "สต๊อกพอขาย ศูนย์กระจายสินค้าลำพูน ต่ำกว่า 10 วัน",
};

function entra(subject: string) {
  return { provider: "entra" as const, tenant: TENANT, subject, email: null, name: null };
}

function ask(subject: string, text: string, conversation = `dm-${subject}`, isPrivate = true) {
  return { kind: "ask" as const, channel: "teams" as const, sender: entra(subject), place: { conversation, private: isPrivate }, text };
}

function decide(subject: string, approvalId: string, approved: boolean) {
  return { kind: "decide" as const, channel: "teams" as const, sender: entra(subject), place: { conversation: `dm-${subject}`, private: true }, approvalId, approved };
}

function answerOf(reply: Awaited<ReturnType<typeof answerChannel>>) {
  if (reply.kind !== "answer") throw new Error(`expected an answer, got ${JSON.stringify(reply)}`);
  return reply;
}

beforeAll(() => {
  const at = new Date().toISOString();
  linkIdentity(entra("oid-ceo"), "u_thana", "test", at);
  linkIdentity(entra("oid-krit"), "u_krit", "test", at);
  linkIdentity(entra("oid-wee"), "u_wee", "test", at);
});

describe("answerChannel", () => {
  test("the CEO's question runs as the CEO: six regions, headline first, five rows and the rest left for the web, audited as teams", async () => {
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
    const reply = answerOf(await answerChannel(ask("oid-ceo", "ยอดขายแยกตามภาคเดือนนี้"), WEB));
    const threadId = channelThreadId("teams", "dm-oid-ceo", "u_thana");
    expect(reply.text).toBe("ภาคอีสานต่ำกว่าเป้า");
    expect(reply.webUrl).toBe(`${WEB}/c/${threadId}`);
    const [card] = reply.cards;
    expect(card.hero?.value).toBe("1,110.2 ล้านบาท");
    expect(card.rows.map((row) => row.label)).toEqual(["กรุงเทพฯ และปริมณฑล", "ภาคอีสาน", "ภาคตะวันออก", "ภาคกลาง", "ภาคใต้"]);
    expect(card.more).toBe(1);
    expect(threads().get(threadId)?.userId).toBe("u_thana");
    const audited = auditLog().where((entry) => entry.userId === "u_thana" && entry.tool === "query_metric" && entry.threadId === threadId);
    expect(audited.map((entry) => entry.initiator)).toEqual(["teams"]);
  });

  test("the same question from u_krit returns only ภาคอีสาน, because scope comes from the linked user", async () => {
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ยอดภาคอีสาน" }]);
    const reply = answerOf(await answerChannel(ask("oid-krit", "ยอดขายแยกตามภาคเดือนนี้"), WEB));
    const [card] = reply.cards;
    expect(card.hero?.value).toBe("232.5 ล้านบาท");
    const shown = JSON.stringify(card);
    for (const other of ["กรุงเทพฯ", "ภาคตะวันออก", "ภาคกลาง", "ภาคใต้", "ภาคเหนือ", "1,110.2"]) expect(shown).not.toContain(other);
  });

  test("a sender nobody linked gets only the way to get linked, runs nothing, and shows up for IT", async () => {
    const before = auditLog().all().length;
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ไม่ควรตอบ" }]);
    const reply = await answerChannel(ask("oid-stranger", "ยอดขายแยกตามภาค"), WEB);
    expect(reply).toEqual({ kind: "unlinked" });
    expect(auditLog().all().length).toBe(before);
    expect(pendingAttempt(identityKey(entra("oid-stranger")))?.count).toBe(1);
  });

  test("a question in a shared conversation is not answered, so one person's data never reaches the others", async () => {
    const before = auditLog().all().length;
    const reply = await answerChannel(ask("oid-ceo", "ยอดขายแยกตามภาค", "group-1", false), WEB);
    expect(reply).toEqual({ kind: "notice", text: expect.stringContaining("แชทส่วนตัว") });
    expect(auditLog().all().length).toBe(before);
  });

  test("a write waits for approve in the chat app, runs once through the approvals ledger, and refuses a second press and another person's press", async () => {
    const before = watchesOf("u_wee").length;
    const startedAt = new Date().toISOString();
    scripted.script([{ call: "watch_metric", args: WATCH }]);
    const asking = answerOf(await answerChannel(ask("oid-wee", "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน"), WEB));
    expect(asking.approval?.question).toContain("เฝ้าดู");
    expect(watchesOf("u_wee")).toHaveLength(before);
    const approvalId = asking.approval?.id ?? "";

    expect(await answerChannel(decide("oid-ceo", approvalId, true), WEB)).toEqual({ kind: "notice", text: expect.stringContaining("ไม่พบคำขออนุมัติ") });
    expect(watchesOf("u_wee")).toHaveLength(before);

    scripted.script([{ text: "ตั้งการเฝ้าดูแล้ว" }]);
    const approved = answerOf(await answerChannel(decide("oid-wee", approvalId, true), WEB));
    expect(approved.text).toBe("ตั้งการเฝ้าดูแล้ว");
    expect(watchesOf("u_wee")).toHaveLength(before + 1);
    const audited = auditLog().where((entry) => entry.userId === "u_wee" && entry.tool === "watch_metric" && entry.at >= startedAt);
    expect(audited.map((entry) => [entry.decision, entry.initiator])).toEqual([["allow", "teams"]]);

    const replayed = await answerChannel(decide("oid-wee", approvalId, true), WEB);
    expect(replayed).toEqual({ kind: "notice", text: expect.stringContaining("ใช้ไปแล้ว") });
    expect(watchesOf("u_wee")).toHaveLength(before + 1);
  });

  test("reject answers the approval without running the write", async () => {
    const before = watchesOf("u_wee").length;
    scripted.script([{ call: "watch_metric", args: { ...WATCH, title: "อีกรายการ" } }]);
    const asking = answerOf(await answerChannel(ask("oid-wee", "เตือนอีกเรื่อง"), WEB));
    scripted.script([{ text: "ไม่ตั้งให้ครับ" }]);
    const rejected = answerOf(await answerChannel(decide("oid-wee", asking.approval?.id ?? "", false), WEB));
    expect(rejected.text).toBe("ไม่ตั้งให้ครับ");
    expect(watchesOf("u_wee")).toHaveLength(before);
  });
});
