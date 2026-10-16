import { beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import type { ApprovalRecord } from "@/lib/harness/approvals";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { notifications, outbox } = await import("@/lib/server/agent/collections");
const { shares } = await import("@/lib/server/share/shares");
const { TH } = await import("@/lib/i18n/th");
const { collection } = await import("@/lib/server/store/json-store");
const { APPROVALS_COLLECTION } = await import("@/lib/harness/approvals");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const THREAD = `approval-gate-${Date.now()}`;
const DRAW_AND_SEND_THREAD = `${THREAD}-draw-and-send`;
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const NORTHEAST_BY_PROVINCE = { metric: "net_sales_volume", dims: ["province"], grain: "month", range: { from: "2026-11-01", to: "2026-11-26" }, compare: "target", filters: { region: ["northeast"] }, sort: "value_asc", limit: 10 };

type Message = { id: string; content: string };
type RunFinished = { type?: string; outcome?: { type?: string; interrupts?: { id?: string; metadata?: { mastra?: { toolName?: string } } }[] } };

function interruptsOf(sse: string): { id: string; tool: string }[] {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    const event = JSON.parse(line.slice("data:".length)) as RunFinished;
    if (event.type !== "RUN_FINISHED" || event.outcome?.type !== "interrupt") return [];
    return (event.outcome.interrupts ?? []).map((interrupt) => ({ id: interrupt.id ?? "", tool: interrupt.metadata?.mastra?.toolName ?? "" }));
  });
}

function ceo() {
  const found = findUser("u_thana");
  if (!found) throw new Error("no u_thana");
  return liveAccessFor(found);
}

async function chatTurn(message: Message, answer: { interruptId: string; approved: boolean } | null = null, threadId = THREAD): Promise<{ id: string; tool: string }[]> {
  const resume = answer ? { resume: [{ interruptId: answer.interruptId, status: "resolved", payload: { approved: answer.approved } }] } : {};
  const body = { threadId, runId: crypto.randomUUID(), state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...resume };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  return interruptsOf(await (await serveCopilot(ceo(), request, LEARNING)).text());
}

function approvals() {
  return collection<ApprovalRecord>(APPROVALS_COLLECTION);
}

function promptOfLastCall(): string {
  return JSON.stringify(scripted.model.doStreamCalls.at(-1)?.prompt ?? []);
}

type Effects = { shares: number; mails: number; told: number };

function sentByCeo() {
  return shares().where((share) => share.senderId === "u_thana");
}

function effects(): Effects {
  const codes = new Set(sentByCeo().map((share) => share.id));
  return { shares: codes.size, mails: outbox().where((entry) => entry.kind === "share").length, told: notifications().where((note) => note.userId === "u_krit" && codes.has(note.refId)).length };
}

function effectsSince(before: Effects): Effects {
  const now = effects();
  return { shares: now.shares - before.shares, mails: now.mails - before.mails, told: now.told - before.told };
}

const NOTHING: Effects = { shares: 0, mails: 0, told: 0 };

beforeAll(async () => {
  scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
  await chatTurn({ id: crypto.randomUUID(), content: "ยอดขายแยกตามภาคเดือนนี้" });
});

async function askToShareWithNulls(): Promise<{ message: Message; asked: { id: string; tool: string }[] }> {
  scripted.script([{ call: "send_card", args: { to: ["คุณกฤต"], ask: "ทีมทำได้ดี", intent: null, urgency: null, card: null } }, { text: "ส่งแล้ว" }]);
  const message = { id: crypto.randomUUID(), content: "ส่งการ์ดนี้ให้คุณกฤตเลย บอกว่าทีมทำได้ดี ไม่ต้องถามผม" };
  return { message, asked: await chatTurn(message) };
}

describe("a write the model calls with the nulls Gemini sends for optional fields", () => {
  test("raises its approval card and sends nothing before the person says yes", async () => {
    const before = effects();
    const { asked } = await askToShareWithNulls();
    expect(effectsSince(before)).toEqual(NOTHING);
    expect(asked.map((interrupt) => interrupt.tool)).toEqual(["send_card"]);
  });

  test("approved, it creates exactly one matter in Winyu, with the card on screen, and tells the recipient once; no mail leaves", async () => {
    const before = effects();
    const { message, asked } = await askToShareWithNulls();
    scripted.script([{ text: "ส่งให้คุณกฤตแล้ว" }]);
    await chatTurn(message, { interruptId: asked[0]?.id ?? "", approved: true });
    expect(effectsSince(before)).toEqual({ shares: 1, mails: 0, told: 1 });
    const sent = sentByCeo().sort((left, right) => right.at.localeCompare(left.at))[0];
    expect(sent).toMatchObject({ intent: "act", ask: "ทีมทำได้ดี", path: [{ userId: "u_krit", fromUserId: "u_thana", state: "sent" }], card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value", dims: ["region"] } }] } });
  });

  test("ส่งการ์ดนี้ in the exchange that drew a card sends that card, not the one before it", async () => {
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
    await chatTurn({ id: crypto.randomUUID(), content: "ยอดขายแยกตามภาคเดือนนี้" }, null, DRAW_AND_SEND_THREAD);
    scripted.script([{ call: "query_metric", args: NORTHEAST_BY_PROVINCE }, { call: "send_card", args: { to: ["พี่อนุชา"] } }, { text: "ส่งแล้ว" }]);
    const message = { id: crypto.randomUUID(), content: "ขอยอดอีสานรายจังหวัดเทียบเป้า แล้วส่งการ์ดนี้ให้พี่อนุชา" };
    const asked = await chatTurn(message, null, DRAW_AND_SEND_THREAD);
    expect(asked.map((interrupt) => interrupt.tool)).toEqual(["send_card"]);
    scripted.script([{ text: "ส่งให้คุณอนุชาแล้ว" }]);
    await chatTurn(message, { interruptId: asked[0]?.id ?? "", approved: true }, DRAW_AND_SEND_THREAD);
    const sent = sentByCeo().sort((left, right) => right.at.localeCompare(left.at))[0];
    expect(sent?.path.map((hop) => hop.userId)).toEqual(["u_anucha"]);
    expect(sent?.card.reads[0]?.input).toMatchObject({ metric: "net_sales_volume", dims: ["province"] });
  });

  test("a new message sent while the card waits declines it: nothing is sent, the decline is recorded, and the model answers the new message", async () => {
    const before = effects();
    const { asked } = await askToShareWithNulls();
    const interruptId = asked[0]?.id ?? "";
    const newQuestion = { id: crypto.randomUUID(), content: "ไม่ต้องส่งแล้ว ขอยอดขายภาคเหนือแทน" };
    scripted.script([{ text: "ยอดขายภาคเหนือเดือนนี้" }]);
    await chatTurn(newQuestion, { interruptId, approved: false });
    expect(effectsSince(before)).toEqual(NOTHING);
    expect(approvals().get(interruptId)?.status).toBe("declined");
    expect(promptOfLastCall()).toContain(newQuestion.content);
  });

  test("the run that carries out a yes tells the model it is done, and the one after a no that nothing was done, so neither reply asks to confirm again", async () => {
    const yes = await askToShareWithNulls();
    scripted.script([{ text: "ส่งให้คุณกฤตแล้ว" }]);
    await chatTurn(yes.message, { interruptId: yes.asked[0]?.id ?? "", approved: true });
    expect(promptOfLastCall()).toContain(TH.harness.answeredYes("send_card"));
    expect(promptOfLastCall()).not.toContain(TH.harness.answeredNo("send_card"));

    const no = await askToShareWithNulls();
    expect(promptOfLastCall()).not.toContain(TH.harness.answeredYes("send_card"));
    scripted.script([{ text: "ยกเลิกแล้วครับ" }]);
    await chatTurn(no.message, { interruptId: no.asked[0]?.id ?? "", approved: false });
    expect(promptOfLastCall()).toContain(TH.harness.answeredNo("send_card"));
  });

  test("declined, it never sends", async () => {
    const before = effects();
    const { message, asked } = await askToShareWithNulls();
    scripted.script([{ text: "ยังไม่ส่งครับ" }]);
    await chatTurn(message, { interruptId: asked[0]?.id ?? "", approved: false });
    expect(effectsSince(before)).toEqual(NOTHING);
  });
});
