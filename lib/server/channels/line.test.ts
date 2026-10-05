import { afterAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { NextRequest } from "next/server";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(60_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { SIMULATED, startChannelHarness } = await import("@/scripts/channel-harness");
const { lineSignature } = await import("@/scripts/channels-sim");
const { POST: confirmLink } = await import("@/app/api/line-link/route");
const { identityKey, linkedUser, pendingAttempt } = await import("@/lib/server/identity");
const { sessionCookie } = await import("@/lib/server/auth/session-token");
const { auditLog } = await import("@/lib/server/audit");
const { watchesOf } = await import("@/lib/server/watches");
const { approvalPostback } = await import("./line-flex");

const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const WATCH = {
  condition: { kind: "below", value: 10 },
  query: { where: null, filters: { dc: "dc_lamphun" }, range: { to: "2026-09-22", from: "2026-09-22" }, metric: "days_of_cover", sort: "value_asc", grain: "day", limit: 10, dims: ["dc"], compare: "none" },
  title: "สต๊อกพอขาย ศูนย์กระจายสินค้าลำพูน ต่ำกว่า 10 วัน",
};
const APP = "http://localhost:3218";
const KRIT_LINE = "U00000000000000000000000000krit1";
const WEE_LINE = "U000000000000000000000000000wee1";

type FlexButton = { action: { type: string; uri?: string; data?: string; label: string } };
type LineMessage = { type: string; text?: string; altText?: string; contents?: { footer?: { contents: FlexButton[] } } };

const harness = startChannelHarness();
const sim = harness.simulator;

afterAll(() => harness.stop());

function replied(sent: { kind: string; body: unknown }[]): LineMessage {
  const replies = sent.filter((entry) => entry.kind === "reply");
  expect(replies).toHaveLength(1);
  const [message] = (replies[0].body as { messages: LineMessage[] }).messages;
  return message;
}

function buttons(message: LineMessage): FlexButton[] {
  return message.contents?.footer?.contents ?? [];
}

function lineIdentity(subject: string) {
  return { provider: "line" as const, tenant: SIMULATED.line.channelId, subject };
}

function cookieFor(userId: string): string {
  const cookie = sessionCookie({ via: "demo", userId });
  return `${cookie.name}=${cookie.value}`;
}

function confirmRequest(token: string, userId: string, origin = APP): NextRequest {
  return new NextRequest(`${APP}/api/line-link`, { method: "POST", headers: { cookie: cookieFor(userId), origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
}

async function linkThroughWeb(lineUserId: string, displayName: string, userId: string): Promise<LineMessage> {
  const prompt = replied((await sim.lineSay(lineUserId, "สวัสดี", displayName)).sent);
  const uri = buttons(prompt)[0]?.action.uri ?? "";
  const token = decodeURIComponent(uri.split("/link/line/")[1] ?? "");
  const confirmed = await confirmLink(confirmRequest(token, userId));
  expect(confirmed.status).toBe(303);
  const dialog = confirmed.headers.get("location") ?? "";
  expect(dialog).toStartWith(`${sim.origin}/dialog/bot/accountLink?linkToken=`);
  const before = sim.sent.length;
  expect((await fetch(dialog)).status).toBe(200);
  const finished = sim.sent.slice(before).find((entry) => entry.kind === "reply");
  return (finished?.body as { messages: LineMessage[] }).messages[0];
}

async function post(body: string, signature: string | null): Promise<number> {
  const headers: Record<string, string> = { "content-type": "application/json", ...(signature ? { "x-line-signature": signature } : {}) };
  return (await fetch(`${harness.mascopOrigin}/api/channels/line`, { method: "POST", headers, body })).status;
}

describe("LINE channel (Messaging API simulator)", () => {
  test("a webhook without the channel secret's signature is refused and nothing is sent", async () => {
    const before = sim.sent.length;
    const body = JSON.stringify({ destination: SIMULATED.line.botUserId, events: [{ type: "message", replyToken: "r1", source: { type: "user", userId: KRIT_LINE }, message: { type: "text", id: "1", text: "ยอดขาย" } }] });
    expect(await post(body, null)).toBe(401);
    expect(await post(body, lineSignature(body, "another-secret"))).toBe(401);
    expect(await post(body, "not base64 at all")).toBe(401);
    expect(await post(`${body} `, lineSignature(body, SIMULATED.line.channelSecret))).toBe(401);
    expect(sim.sent.length).toBe(before);
  });

  test("an unlinked LINE user gets only a link button, IT sees the attempt, and nothing runs", async () => {
    const before = auditLog().all().length;
    const prompt = replied((await sim.lineSay("U0000000000000000000000stranger1", "ยอดขายแยกตามภาค", "คนแปลกหน้า")).sent);
    expect(prompt.altText).toContain("ยังไม่ได้เชื่อม");
    expect(buttons(prompt)[0]?.action.uri).toStartWith(`${SIMULATED.web}/link/line/`);
    expect(auditLog().all().length).toBe(before);
    expect(pendingAttempt(identityKey(lineIdentity("U0000000000000000000000stranger1")))?.name).toBe("คนแปลกหน้า");
  });

  test("link flow end to end: link button, sign in on the web, LINE's account-link dialog, then answers in u_krit's scope", async () => {
    const done = await linkThroughWeb(KRIT_LINE, "Krit LINE", "u_krit");
    expect(done.text).toContain("เชื่อมบัญชี LINE กับ");
    expect(linkedUser(lineIdentity(KRIT_LINE))?.id).toBe("u_krit");

    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: "**ยอดภาคอีสาน** ต่ำกว่าเป้า" }]);
    const answer = replied((await sim.lineSay(KRIT_LINE, "ยอดขายแยกตามภาคเดือนนี้")).sent);
    const json = JSON.stringify(answer);
    expect(answer.type).toBe("flex");
    expect(json).toContain("232.5 ล้านบาท");
    expect(json).toContain("ยอดภาคอีสาน ต่ำกว่าเป้า");
    for (const other of ["กรุงเทพฯ", "ภาคตะวันออก", "ภาคกลาง", "ภาคใต้", "ภาคเหนือ", "1,110.2"]) expect(json).not.toContain(other);
    expect(auditLog().where((entry) => entry.userId === "u_krit" && entry.initiator === "line").length).toBeGreaterThan(0);
  });

  test("a link request is spent once, refuses a post from another site, and LINE reporting a different user links nobody", async () => {
    const prompt = replied((await sim.lineSay("U00000000000000000000000000mana1", "สวัสดี", "Mana")).sent);
    const token = decodeURIComponent((buttons(prompt)[0]?.action.uri ?? "").split("/link/line/")[1] ?? "");
    const back = `${APP}/link/line/${encodeURIComponent(token)}`;
    expect((await confirmLink(confirmRequest(token, "u_nok", "https://evil.example.com"))).headers.get("location")).toBe(back);
    const first = await confirmLink(confirmRequest(token, "u_nok"));
    expect(first.headers.get("location")).toStartWith(`${sim.origin}/dialog/bot/accountLink`);
    expect((await confirmLink(confirmRequest(token, "u_thana"))).headers.get("location")).toBe(back);
    const nonce = new URL(first.headers.get("location") ?? "").searchParams.get("nonce") ?? "";
    const forged = await sim.linePressAccountLink("U0000000000000000000000000other1", nonce);
    expect(replied(forged.sent).text).toContain("ไม่สำเร็จ");
    expect(linkedUser(lineIdentity("U00000000000000000000000000mana1"))).toBeNull();
    expect(linkedUser(lineIdentity("U0000000000000000000000000other1"))).toBeNull();
  });

  test("a write waits for approve in LINE and runs once through the approvals ledger", async () => {
    await linkThroughWeb(WEE_LINE, "Wee LINE", "u_wee");
    scripted.script([{ call: "watch_metric", args: WATCH }]);
    const asking = replied((await sim.lineSay(WEE_LINE, "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน")).sent);
    const approve = buttons(asking).find((button) => button.action.type === "postback" && button.action.label === "อนุมัติ");
    expect(approve).toBeDefined();
    const before = watchesOf("u_wee").length;

    scripted.script([{ text: "ตั้งการเฝ้าดูแล้ว" }]);
    const approved = replied((await sim.linePress(WEE_LINE, approve?.action.data ?? "")).sent);
    expect(JSON.stringify(approved)).toContain("ตั้งการเฝ้าดูแล้ว");
    expect(watchesOf("u_wee")).toHaveLength(before + 1);

    const replayed = replied((await sim.linePress(WEE_LINE, approve?.action.data ?? "")).sent);
    expect(replayed.text).toContain("ใช้ไปแล้ว");
    expect(watchesOf("u_wee")).toHaveLength(before + 1);

    const forged = replied((await sim.linePress(KRIT_LINE, approve?.action.data ?? approvalPostback("x", true))).sent);
    expect(forged.text).toContain("ไม่พบคำขออนุมัติ");
  });

  test("in a group the bot answers a mention with the pointer to a private chat and stays quiet otherwise", async () => {
    const before = auditLog().all().length;
    const pointed = replied((await sim.lineSayInGroup(KRIT_LINE, "@mascop ยอดขาย")).sent);
    expect(pointed.text).toContain("แชทส่วนตัว");
    const quiet = await sim.lineSayInGroup(KRIT_LINE, "ใครว่างบ้าง", false);
    expect(quiet.sent).toHaveLength(0);
    expect(auditLog().all().length).toBe(before);
  });
});
