import { beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import type { ApprovalRecord } from "@/lib/harness/approvals";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { outbox } = await import("@/lib/server/agent/collections");
const { shares } = await import("@/lib/server/share/shares");
const { TH } = await import("@/lib/i18n/th");
const { collection } = await import("@/lib/server/store/json-store");
const { APPROVALS_COLLECTION } = await import("@/lib/harness/approvals");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const THREAD = `approval-gate-${Date.now()}`;
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };

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

async function chatTurn(message: Message, answer: { interruptId: string; approved: boolean } | null = null): Promise<{ id: string; tool: string }[]> {
  const resume = answer ? { resume: [{ interruptId: answer.interruptId, status: "resolved", payload: { approved: answer.approved } }] } : {};
  const body = { threadId: THREAD, runId: crypto.randomUUID(), state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...resume };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  return interruptsOf(await (await serveCopilot(ceo(), request, LEARNING)).text());
}

function approvals() {
  return collection<ApprovalRecord>(APPROVALS_COLLECTION);
}

function promptOfLastCall(): string {
  return JSON.stringify(scripted.model.doStreamCalls.at(-1)?.prompt ?? []);
}

type Effects = { shares: number; mails: number };

function effects(): Effects {
  return { shares: shares().where((share) => share.senderId === "u_thana").length, mails: outbox().where((entry) => entry.kind === "share").length };
}

function effectsSince(before: Effects): Effects {
  const now = effects();
  return { shares: now.shares - before.shares, mails: now.mails - before.mails };
}

beforeAll(async () => {
  scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
  await chatTurn({ id: crypto.randomUUID(), content: "ยอดขายแยกตามภาคเดือนนี้" });
});

async function askToShareWithNulls(): Promise<{ message: Message; asked: { id: string; tool: string }[] }> {
  scripted.script([{ call: "share_card", args: { to: ["คุณกฤต"], channel: null, note: "ทีมทำได้ดี" } }, { text: "ส่งแล้ว" }]);
  const message = { id: crypto.randomUUID(), content: "ส่งการ์ดนี้ให้คุณกฤตเลย บอกว่าทีมทำได้ดี ไม่ต้องถามผม" };
  return { message, asked: await chatTurn(message) };
}

describe("a write the model calls with the nulls Gemini sends for optional fields", () => {
  test("raises its approval card and sends nothing before the person says yes", async () => {
    const before = effects();
    const { asked } = await askToShareWithNulls();
    expect(effectsSince(before)).toEqual({ shares: 0, mails: 0 });
    expect(asked.map((interrupt) => interrupt.tool)).toEqual(["share_card"]);
  });

  test("approved, it sends once", async () => {
    const before = effects();
    const { message, asked } = await askToShareWithNulls();
    scripted.script([{ text: "ส่งให้คุณกฤตแล้ว" }]);
    await chatTurn(message, { interruptId: asked[0]?.id ?? "", approved: true });
    expect(effectsSince(before)).toEqual({ shares: 1, mails: 1 });
  });

  test("a new message sent while the card waits declines it: nothing is sent, the decline is recorded, and the model answers the new message", async () => {
    const before = effects();
    const { asked } = await askToShareWithNulls();
    const interruptId = asked[0]?.id ?? "";
    const newQuestion = { id: crypto.randomUUID(), content: "ไม่ต้องส่งแล้ว ขอยอดขายภาคเหนือแทน" };
    scripted.script([{ text: "ยอดขายภาคเหนือเดือนนี้" }]);
    await chatTurn(newQuestion, { interruptId, approved: false });
    expect(effectsSince(before)).toEqual({ shares: 0, mails: 0 });
    expect(approvals().get(interruptId)?.status).toBe("declined");
    expect(promptOfLastCall()).toContain(newQuestion.content);
  });

  test("the run that carries out a yes tells the model it is done, and the one after a no that nothing was done, so neither reply asks to confirm again", async () => {
    const yes = await askToShareWithNulls();
    scripted.script([{ text: "ส่งให้คุณกฤตแล้ว" }]);
    await chatTurn(yes.message, { interruptId: yes.asked[0]?.id ?? "", approved: true });
    expect(promptOfLastCall()).toContain(TH.harness.answeredYes("share_card"));
    expect(promptOfLastCall()).not.toContain(TH.harness.answeredNo("share_card"));

    const no = await askToShareWithNulls();
    expect(promptOfLastCall()).not.toContain(TH.harness.answeredYes("share_card"));
    scripted.script([{ text: "ยกเลิกแล้วครับ" }]);
    await chatTurn(no.message, { interruptId: no.asked[0]?.id ?? "", approved: false });
    expect(promptOfLastCall()).toContain(TH.harness.answeredNo("share_card"));
  });

  test("declined, it never sends", async () => {
    const before = effects();
    const { message, asked } = await askToShareWithNulls();
    scripted.script([{ text: "ยังไม่ส่งครับ" }]);
    await chatTurn(message, { interruptId: asked[0]?.id ?? "", approved: false });
    expect(effectsSince(before)).toEqual({ shares: 0, mails: 0 });
  });
});
