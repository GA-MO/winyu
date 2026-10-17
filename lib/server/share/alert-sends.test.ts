import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import type { ScreenCards, ShareTarget } from "@/lib/share/card";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { waitingOn } from "@/lib/server/tools/inbox";
import { approvedCallId } from "@/scripts/approved-call";
import { onScreen, screenWith } from "@/scripts/screen-cards";
import { createShare } from "./deliver";
import { cardHero } from "./goal";
import { sendPreview } from "./preview";
import { shares } from "./shares";

setDefaultTimeout(60_000);

const CEO = "u_thana";
const RSM = "u_anucha";
const REP = "u_krit";
const ISAN_RISE = "อีสานรุ่งโรจน์ ค้าส่ง";
const UBON = "อุบลศรีสุข เทรดดิ้ง";
const ISAN_ALERTS: ShareTarget = { card: { kind: "tool", reads: [{ tool: "get_alerts", input: { dims: { region: "northeast" }, status: "open" } }] }, question: null };
const ISAN_AGENTS_READ = { grain: "day", metric: "net_sales_value", sort: "delta_asc", dims: ["agent"], range: { from: "2026-11-01", to: "2026-11-26" }, compare: "target", filters: { region: ["northeast"] } };
const ISAN_AGENTS: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: ISAN_AGENTS_READ }] }, question: null };
const ONE_AGENT_ALERTS: ShareTarget = { card: { kind: "tool", reads: [{ tool: "get_alerts", input: { metric: "net_sales_value", status: "open", dims: { agent: ISAN_RISE } } }] }, question: "ทำไมอีสานรุ่งโรจน์ ค้าส่งยอดตกหนักขนาดนี้" };
const ASK = "ช่วยตรวจว่าอีสานรุ่งโรจน์ ค้าส่ง และอุบลศรีสุข เทรดดิ้ง ติดปัญหาเครดิตหรือไม่ พร้อมตรวจสอบประวัติการสั่งซื้อ";
const SEND_QUESTION = "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน";
const made: string[] = [];

type Sent = { ok: boolean; code?: string; error?: string; data?: { code: string; title: string } };

function user(id: string) {
  const found = findUser(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

async function send(input: Record<string, unknown>, screen: ScreenCards): Promise<Sent> {
  const turn = { turnId: randomUUID(), threadId: null, question: SEND_QUESTION, queries: [], screenCards: async () => screen };
  const tool = winyuTools().send_card;
  const result = (await runWithAccess(liveAccessFor(user(CEO)), () => runWithTurn(turn, () => tool.execute(input, { toolCallId: approvedCallId(CEO, "send_card") })))) as Sent;
  if (result.data?.code) made.push(result.data.code);
  return result;
}

afterAll(() => {
  for (const code of made) shares().remove(code);
});

describe("the share layer reads anomaly cards (AI-291, AI-297)", () => {
  test("the anomaly card whose rows are the agents the ask names is sent on the first call, about those agents", async () => {
    const sent = await send({ to: [RSM], cardRef: onScreen(ISAN_ALERTS).ref, urgency: "now", ask: ASK }, screenWith([ISAN_AGENTS, ISAN_ALERTS]));
    expect(sent.code).toBeUndefined();
    expect(sent.ok).toBe(true);
    const matter = shares().get(sent.data?.code ?? "");
    expect(matter?.focus).toEqual([ISAN_RISE, UBON]);
    expect(matter?.title).toBe(`ความผิดปกติที่ต้องดู · ภาคอีสาน · ${ISAN_RISE}, ${UBON}`);
  });

  test("the approval of that send leads with the named agents' alerts, not a bare list", async () => {
    const preview = await sendPreview(ISAN_ALERTS.card, user(CEO), [], [ASK]);
    expect(preview.focus?.labels).toEqual([ISAN_RISE, UBON]);
    expect(preview.focus?.hero).toBe(`${ISAN_RISE} · ปริมาณขายเข้า −89% · ${UBON} · ปริมาณขายเข้า −84%`);
    expect(preview.focus?.figure).toMatchObject({ label: `${ISAN_RISE} · ปริมาณขายเข้า`, value: "−89%", tone: "bad" });
  });

  test("an anomaly card about one agent is titled by that agent, and the rep's inbox row carries its figure and opens the matter", async () => {
    const outcome = await createShare(user(RSM), { card: ONE_AGENT_ALERTS.card, question: ONE_AGENT_ALERTS.question, ask: "ช่วยเข้าตรวจเยี่ยมร้าน", intent: "act", recipients: [{ userId: REP, channel: "winyu" }] });
    if (!outcome.ok) throw new Error(outcome.error);
    made.push(outcome.share.id);
    expect(outcome.share.title).toBe(`ความผิดปกติที่ต้องดู · ${ISAN_RISE}`);
    expect(await cardHero(outcome.share.card, user(REP))).toBe(`${ISAN_RISE} · ปริมาณขายเข้า −89%`);
    const inbox = await waitingOn(liveAccessFor(user(REP)), "matter");
    const row = inbox.rows.find((entry) => entry.path === `/s/${outcome.share.id}`);
    expect(row?.hero).toBe(`${ISAN_RISE} · ปริมาณขายเข้า −89%`);
  });
});

describe("a send about two rows of a card leads with those rows (AI-303)", () => {
  test("the approval's figure is the two agents together on the month's base, not every agent's 77.3%", async () => {
    const preview = await sendPreview(ISAN_AGENTS.card, user(CEO), [], [ASK]);
    expect(preview.focus?.labels).toEqual([ISAN_RISE, UBON]);
    expect(preview.focus?.figure).toMatchObject({ label: `${ISAN_RISE}, ${UBON} รวมกัน`, value: "52.1%", unit: "ของเป้าทั้งเดือน", tone: "bad" });
    expect(preview.focus?.hero).toStartWith(`${ISAN_RISE}, ${UBON} รวมกัน 52.1% ของเป้าทั้งเดือน`);
  });
});
