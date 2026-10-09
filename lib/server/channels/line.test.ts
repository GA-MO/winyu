import { afterAll, afterEach, beforeEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
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
const { threads } = await import("@/lib/server/threads-read");
const { TH } = await import("@/lib/i18n/th");

const APP = "http://localhost:3218";
const KRIT_LINE = "U00000000000000000000000000krit1";

type FlexButton = { action: { type: string; uri?: string; data?: string; label: string } };
type LineMessage = { type: string; text?: string; altText?: string; contents?: { footer?: { contents: FlexButton[] } } };

const harness = startChannelHarness();
const sim = harness.simulator;

let before = { audit: 0, threads: 0 };

beforeEach(() => {
  before = { audit: auditLog().all().length, threads: threads().all().length };
});

afterEach(() => {
  expect(scripted.calls).toBe(0);
  expect(auditLog().all().length).toBe(before.audit);
  expect(threads().all().length).toBe(before.threads);
});

afterAll(() => harness.stop());

function expectAskOnWeb(message: LineMessage) {
  expect(message.altText).toBe(TH.channels.askOnWeb);
  expect(buttons(message).map((button) => button.action)).toEqual([{ type: "uri", label: TH.channels.openWinyu, uri: SIMULATED.web }]);
}

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
  return (await fetch(`${harness.winyuOrigin}/api/channels/line`, { method: "POST", headers, body })).status;
}

describe("LINE channel, send-only (Messaging API simulator)", () => {
  test("a webhook without the channel secret's signature is refused and nothing is sent", async () => {
    const before = sim.sent.length;
    const body = JSON.stringify({ destination: SIMULATED.line.botUserId, events: [{ type: "message", replyToken: "r1", source: { type: "user", userId: KRIT_LINE }, message: { type: "text", id: "1", text: "ยอดขาย" } }] });
    expect(await post(body, null)).toBe(401);
    expect(await post(body, lineSignature(body, "another-secret"))).toBe(401);
    expect(await post(body, "not base64 at all")).toBe(401);
    expect(await post(`${body} `, lineSignature(body, SIMULATED.line.channelSecret))).toBe(401);
    expect(sim.sent.length).toBe(before);
  });

  test("an unlinked LINE user gets only a link button, and IT sees the attempt", async () => {
    const prompt = replied((await sim.lineSay("U0000000000000000000000stranger1", "ยอดขายแยกตามภาค", "คนแปลกหน้า")).sent);
    expect(prompt.altText).toContain("ยังไม่ได้เชื่อม");
    expect(buttons(prompt)[0]?.action.uri).toStartWith(`${SIMULATED.web}/link/line/`);
    expect(pendingAttempt(identityKey(lineIdentity("U0000000000000000000000stranger1")))?.name).toBe("คนแปลกหน้า");
  });

  test("link flow end to end: link button, sign in on the web, LINE's account-link dialog, then a question gets the fixed pointer to the web", async () => {
    const done = await linkThroughWeb(KRIT_LINE, "Krit LINE", "u_krit");
    expect(done.text).toBe(TH.channels.linked("คุณกฤต จันทร์เสน"));
    expect(linkedUser(lineIdentity(KRIT_LINE))?.id).toBe("u_krit");
    expectAskOnWeb(replied((await sim.lineSay(KRIT_LINE, "ยอดขายแยกตามภาคเดือนนี้")).sent));
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

  test("in a group the bot answers a mention with the pointer to the web and stays quiet otherwise", async () => {
    expectAskOnWeb(replied((await sim.lineSayInGroup(KRIT_LINE, "@winyu ยอดขาย")).sent));
    const quiet = await sim.lineSayInGroup(KRIT_LINE, "ใครว่างบ้าง", false);
    expect(quiet.sent).toHaveLength(0);
  });
});
