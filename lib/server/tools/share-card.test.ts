import { beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("@/lib/harness/adapters/mastra/serve");
const { describeToolCall } = await import("@/lib/cards/describe-call");
const { auditLog, SHARE_AUDIT_TOOL } = await import("@/lib/server/audit");
const { outbox } = await import("@/lib/server/agent/collections");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { winyuTools } = await import("@/lib/server/agent/tools");
const { asksApproval } = await import("@/lib/harness/gateway");
const { runWithAccess, runWithTurn } = await import("@/lib/server/request-context");
const { shares } = await import("@/lib/server/share/shares");
const { openShare } = await import("@/lib/server/share/view");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const THREAD = `share-card-${Date.now()}`;
const SPENT_STATUS = 409;
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const NOTE = "ช่วยดูภาคอีสานหน่อย";
const URL_IN_TEXT = /https?:\/\/\S+/g;
const DIGIT = /[0-9๐-๙]/;

type Asked = { interruptId: string; tool: string; args: unknown };
type ChatTurn = { asked: Asked[]; spent: boolean };
type Message = { id: string; content: string };
type RunFinished = { type?: string; outcome?: { type?: string; interrupts?: { id?: string; metadata?: { mastra?: { toolName?: string; args?: unknown } } }[] } };

function askedOf(sse: string): Asked[] {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    const event = JSON.parse(line.slice("data:".length)) as RunFinished;
    if (event.type !== "RUN_FINISHED" || event.outcome?.type !== "interrupt") return [];
    return (event.outcome.interrupts ?? []).map((interrupt) => ({ interruptId: interrupt.id ?? "", tool: interrupt.metadata?.mastra?.toolName ?? "", args: interrupt.metadata?.mastra?.args ?? null }));
  });
}

async function chatTurn(message: Message, resume: { interruptId: string; approved: boolean } | null = null): Promise<ChatTurn> {
  const body = { threadId: THREAD, runId: crypto.randomUUID(), state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...(resume ? { resume: [{ interruptId: resume.interruptId, status: "resolved", payload: { approved: resume.approved } }] } : {}) };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  const response = await serveCopilot(liveAccessFor(user("u_thana")), request, LEARNING);
  const sse = await response.text();
  return response.status === SPENT_STATUS ? { asked: [], spent: true } : { asked: askedOf(sse), spent: false };
}

function questionOf(asked: Asked | undefined): string {
  return asked ? (describeToolCall(asked.tool, asked.args)?.question ?? "") : "";
}

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

function sharesByCeo() {
  return shares().where((share) => share.senderId === "u_thana");
}

function mailsToKrit() {
  return outbox().where((entry) => entry.kind === "share" && entry.toUserId === "u_krit");
}

function asCeo<T>(work: () => T): T {
  return runWithAccess(liveAccessFor(user("u_thana")), work);
}

async function askToShare(args: Record<string, unknown>): Promise<{ message: Message; asked: Asked | undefined }> {
  scripted.script([{ call: "share_card", args }]);
  const message = { id: crypto.randomUUID(), content: "ส่งการ์ดนี้ให้คุณกฤตดูหน่อย" };
  return { message, asked: (await chatTurn(message)).asked[0] };
}

beforeAll(async () => {
  scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
  await chatTurn({ id: crypto.randomUUID(), content: "ยอดขายแยกตามภาคเดือนนี้" });
});

describe("share_card", () => {
  test("a name that fits one colleague asks the person first; a name that fits several or nobody asks nothing", () => {
    const capability = winyuTools().share_card.capability;
    expect(asCeo(() => asksApproval(capability, { to: ["คุณกฤต"] }))).toBe(true);
    expect(asCeo(() => asksApproval(capability, { to: ["u_krit"] }))).toBe(true);
    expect(asCeo(() => asksApproval(capability, { to: ["จันทร"] }))).toBe(false);
    expect(asCeo(() => asksApproval(capability, { to: ["คุณกฤต", "คุณสมศรี"] }))).toBe(false);
  });

  test("a note carries no number the person did not type, so no value from the card travels in the message", async () => {
    const capability = winyuTools().share_card.capability;
    const turn = (question: string) => ({ turnId: null, threadId: null, preloadPacketId: null, question, queries: [] });
    const asked = (question: string, note: string) => asCeo(() => runWithTurn(turn(question), () => asksApproval(capability, { to: ["คุณกฤต"], note })));
    expect(asked("ส่งการ์ดนี้ให้คุณกฤตดู", "ยอดอีสาน 232.5 ล้านบาท ต่ำกว่าเป้า")).toBe(false);
    expect(asked("ส่งให้คุณกฤตดู บอกว่าคุยกันตอน 10 โมง", "คุยกันตอน 10 โมง")).toBe(true);
    expect(asked("ส่งให้คุณกฤตดู", "ช่วยดูภาคอีสานหน่อย")).toBe(true);
    const before = sharesByCeo().length;
    const result = (await asCeo(() => runWithTurn(turn("ส่งการ์ดนี้ให้คุณกฤตดู"), () => winyuTools().share_card.execute({ to: ["คุณกฤต"], note: "ยอด 232.5 ล้าน" })))) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(sharesByCeo()).toHaveLength(before);
  });

  test("an ambiguous name sends nothing and hands the model the candidates to ask about", async () => {
    const before = { shares: sharesByCeo().length, mails: outbox().all().length };
    const result = (await asCeo(() => winyuTools().share_card.execute({ to: ["จันทร"] }))) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("คุณกฤต จันทร์เสน");
    expect(result.error).toContain("คุณพลอย จันทรา");
    expect({ shares: sharesByCeo().length, mails: outbox().all().length }).toEqual(before);
  });

  test("in the chat an ambiguous name raises no approval and no share", async () => {
    const before = sharesByCeo().length;
    const { asked } = await askToShare({ to: ["จันทร"] });
    expect(asked).toBeUndefined();
    expect(sharesByCeo()).toHaveLength(before);
  });

  test("approve sends the card on screen once: its reads not its values, a message with no number, an audit row, and the recipient sees only their own scope", async () => {
    const before = { shares: sharesByCeo().length, mails: mailsToKrit().length };
    const startedAt = new Date().toISOString();
    const asking = await askToShare({ to: ["คุณกฤต"], note: NOTE });
    expect(questionOf(asking.asked)).toContain("คุณกฤต");
    expect(sharesByCeo()).toHaveLength(before.shares);

    scripted.script([{ text: "ส่งให้คุณกฤตแล้ว" }]);
    expect((await chatTurn(asking.message, { interruptId: asking.asked?.interruptId ?? "", approved: true })).spent).toBe(false);
    const sent = sharesByCeo().filter((share) => share.at >= startedAt);
    expect(sent).toHaveLength(1);
    const [share] = sent;
    expect(share.deliveries.map((delivery) => delivery.userId)).toEqual(["u_krit"]);
    expect(share.card).toEqual({ kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] });
    expect(share.question).toBe("ยอดขายแยกตามภาคเดือนนี้");

    const mails = mailsToKrit().filter((entry) => entry.refId === share.id);
    expect(mails).toHaveLength(1);
    expect(mailsToKrit()).toHaveLength(before.mails + 1);
    const [mail] = mails;
    expect(mail.body).toContain(share.title);
    expect(mail.body).toContain(NOTE);
    expect(mail.body).toContain("เปิดดูใน Winyu");
    expect(DIGIT.test(`${mail.subject} ${mail.body.replace(URL_IN_TEXT, "")}`)).toBe(false);

    const audited = auditLog().where((entry) => entry.userId === "u_thana" && entry.at >= startedAt);
    expect(audited.filter((entry) => entry.tool === SHARE_AUDIT_TOOL).map((entry) => entry.toolCallId)).toEqual([share.id]);
    const call = audited.find((entry) => entry.tool === "share_card");
    expect(call?.decision).toBe("allow");
    expect(call?.args ?? "").not.toContain(NOTE);

    scripted.script([{ text: "ไม่ควรส่งซ้ำ" }]);
    expect((await chatTurn(asking.message, { interruptId: asking.asked?.interruptId ?? "", approved: true })).spent).toBe(true);
    expect(sharesByCeo().filter((entry) => entry.at >= startedAt)).toHaveLength(1);

    const opened = await openShare(share, user("u_krit"));
    const rows = (opened.reads[0]?.result as { rows: { region: string }[] }).rows;
    expect(rows.map((row) => row.region)).toEqual(["ภาคอีสาน"]);
  });

  test("reject sends nothing", async () => {
    const before = { shares: sharesByCeo().length, mails: outbox().all().length };
    const asking = await askToShare({ to: ["คุณกฤต"] });
    scripted.script([{ text: "ยังไม่ส่งครับ" }]);
    expect((await chatTurn(asking.message, { interruptId: asking.asked?.interruptId ?? "", approved: false })).spent).toBe(false);
    expect({ shares: sharesByCeo().length, mails: outbox().all().length }).toEqual(before);
  });
});
