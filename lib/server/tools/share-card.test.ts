import { beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { answerChannel } = await import("@/lib/server/channels/answer");
const { linkIdentity } = await import("@/lib/server/identity");
const { auditLog, SHARE_AUDIT_TOOL } = await import("@/lib/server/audit");
const { outbox } = await import("@/lib/server/agent/collections");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { winyuTools } = await import("@/lib/server/agent/tools");
const { asksApproval } = await import("@/lib/harness/gateway");
const { runWithAccess } = await import("@/lib/server/request-context");
const { shares } = await import("@/lib/server/share/shares");
const { openShare } = await import("@/lib/server/share/view");

const TENANT = "11111111-2222-4333-8444-555555555555";
const WEB = "https://winyu.example.com";
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const NOTE = "ช่วยดูภาคอีสานหน่อย";
const URL_IN_TEXT = /https?:\/\/\S+/g;
const DIGIT = /[0-9๐-๙]/;

function entra(subject: string) {
  return { provider: "entra" as const, tenant: TENANT, subject, email: null, name: null };
}

function ask(text: string) {
  return { kind: "ask" as const, channel: "teams" as const, sender: entra("oid-ceo-share"), place: { conversation: "dm-ceo-share", private: true }, text };
}

function decide(approvalId: string, approved: boolean) {
  return { kind: "decide" as const, channel: "teams" as const, sender: entra("oid-ceo-share"), place: { conversation: "dm-ceo-share", private: true }, approvalId, approved };
}

function answerOf(reply: Awaited<ReturnType<typeof answerChannel>>) {
  if (reply.kind !== "answer") throw new Error(`expected an answer, got ${JSON.stringify(reply)}`);
  return reply;
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

async function askToShare(args: Record<string, unknown>) {
  scripted.script([{ call: "share_card", args }]);
  return answerOf(await answerChannel(ask("ส่งการ์ดนี้ให้คุณกฤตดูหน่อย"), WEB));
}

beforeAll(async () => {
  linkIdentity(entra("oid-ceo-share"), "u_thana", "test", new Date().toISOString());
  scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
  answerOf(await answerChannel(ask("ยอดขายแยกตามภาคเดือนนี้"), WEB));
});

describe("share_card", () => {
  test("a name that fits one colleague asks the person first; a name that fits several or nobody asks nothing", () => {
    const capability = winyuTools().share_card.capability;
    expect(asCeo(() => asksApproval(capability, { to: ["คุณกฤต"] }))).toBe(true);
    expect(asCeo(() => asksApproval(capability, { to: ["u_krit"] }))).toBe(true);
    expect(asCeo(() => asksApproval(capability, { to: ["จันทร"] }))).toBe(false);
    expect(asCeo(() => asksApproval(capability, { to: ["คุณกฤต", "คุณสมศรี"] }))).toBe(false);
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
    const reply = await askToShare({ to: ["จันทร"] });
    expect(reply.approval).toBeNull();
    expect(sharesByCeo()).toHaveLength(before);
  });

  test("approve sends the card on screen once: its reads not its values, a message with no number, an audit row, and the recipient sees only their own scope", async () => {
    const before = { shares: sharesByCeo().length, mails: mailsToKrit().length };
    const startedAt = new Date().toISOString();
    const asking = await askToShare({ to: ["คุณกฤต"], note: NOTE });
    expect(asking.approval?.question).toContain("คุณกฤต");
    expect(sharesByCeo()).toHaveLength(before.shares);

    scripted.script([{ text: "ส่งให้คุณกฤตแล้ว" }]);
    answerOf(await answerChannel(decide(asking.approval?.id ?? "", true), WEB));
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
    expect(await answerChannel(decide(asking.approval?.id ?? "", true), WEB)).toEqual({ kind: "notice", text: expect.stringContaining("ใช้ไปแล้ว") });
    expect(sharesByCeo().filter((entry) => entry.at >= startedAt)).toHaveLength(1);

    const opened = await openShare(share, user("u_krit"));
    const rows = (opened.reads[0]?.result as { rows: { region: string }[] }).rows;
    expect(rows.map((row) => row.region)).toEqual(["ภาคอีสาน"]);
  });

  test("reject sends nothing", async () => {
    const before = { shares: sharesByCeo().length, mails: outbox().all().length };
    const asking = await askToShare({ to: ["คุณกฤต"] });
    scripted.script([{ text: "ยังไม่ส่งครับ" }]);
    answerOf(await answerChannel(decide(asking.approval?.id ?? "", false), WEB));
    expect({ shares: sharesByCeo().length, mails: outbox().all().length }).toEqual(before);
  });
});
