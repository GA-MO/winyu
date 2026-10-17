import { describe, expect, test } from "bun:test";
import { liveAccessFor } from "@/lib/access/enforce";
import { presentCard } from "@/lib/cards/present";
import { metricAnswerOf, metricTitle } from "@/lib/cards/tool-answers";
import { findUser } from "@/lib/data/entities/users";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { cardRefOf, type SharedCard } from "@/lib/share/card";
import { cardNamed, screenCardsEach } from "./card-to-share";
import type { Exchange, ReplyStep, ToolStep } from "./timeline";

const CARD_TOOLS: ReadonlySet<string> = new Set(["query_metric", "find_people", "get_person", "resolve_owner", "describe_entity", "list_metrics"]);
const BY_REGION = { metric: "net_sales_value", dims: ["region"] };
const BY_AGENT = { metric: "net_sales_volume", dims: ["agent"] };
const OVERDUE = { metric: "ar_overdue", dims: ["agent"], filters: { agent: "ag_nea_02" } };
const KRIT_ROW = { id: "u_krit", name: "คุณกฤต จันทร์เสน", title: "พนักงานขาย ขอนแก่น" };
const HEADLINE = { value: "5.1 ล้านลิตร" };

function returned(toolCallId: string, name: string, args: unknown, result: unknown): ToolStep {
  return { kind: "tool", toolCallId, name, args, outcome: { state: "returned", result } };
}

function pending(toolCallId: string, name: string, args: unknown): ToolStep {
  return { kind: "tool", toolCallId, name, args, outcome: { state: "pending" } };
}

function metric(toolCallId: string, args: unknown): ToolStep {
  return returned(toolCallId, "query_metric", args, { ok: true, rows: [{ value: 1 }], headline: HEADLINE });
}

function exchange(id: string, question: string, steps: ReplyStep[]): Exchange {
  return { id, question: { kind: "typed", text: question }, steps };
}

function card(input: Record<string, unknown>): SharedCard {
  return { kind: "tool", reads: [{ tool: "query_metric", input }] };
}

function lastScreen(exchanges: readonly Exchange[]) {
  const screens = screenCardsEach(exchanges, CARD_TOOLS);
  const last = screens.at(-1);
  if (!last) throw new Error("no exchange");
  return last;
}

const SALES = exchange("q1", "ยอดขายแยกตามภาคเดือนนี้", [metric("m1", BY_REGION)]);

describe("the cards on screen a send can name", () => {
  test("are the sendable cards drawn so far, each with a ref from what it is, its title and headline figure", () => {
    const [first] = screenCardsEach([SALES], CARD_TOOLS);
    expect(first.cards).toEqual([{ ref: cardRefOf(card(BY_REGION)), exchangeId: "q1", target: { card: card(BY_REGION), question: "ยอดขายแยกตามภาคเดือนนี้" }, title: "มูลค่าขายเข้า · รายภาค", hero: HEADLINE.value }]);
    expect(cardRefOf(card({ ...BY_REGION, filters: null }))).toBe(cardRefOf(card({ dims: ["region"], metric: "net_sales_value" })));
  });

  test("never hold a lookup: a person, an owner, an HR profile or a master-data record found on a send turn is not a card to send", () => {
    const send = exchange("q2", "ส่งการ์ดยอดเอเย่นต์ให้หัวหน้าผม", [
      returned("p1", "get_person", { name: "กฤต" }, { ok: true, data: { ...KRIT_ROW, facts: [{ label: "โอที", value: "12 ชม." }] } }),
      returned("o1", "resolve_owner", { metric: "net_sales_volume" }, { ok: true, data: { userId: "u_anucha", nameTh: "คุณอนุชา พรหมศรี" } }),
      returned("e1", "describe_entity", { query: "สงขลาทักษิณ", kind: "agent" }, { ok: true, data: { id: "ag_sou_02" } }),
      pending("s1", "send_card", { to: ["u_anucha"] }),
    ]);
    const screen = lastScreen([exchange("q1", "ยอดเอเย่นต์ผม", [metric("m1", BY_AGENT)]), send]);
    expect(screen.cards.map((drawn) => drawn.target.card)).toEqual([card(BY_AGENT)]);
    expect(cardNamed(screen, undefined)).toMatchObject({ kind: "card", card: { target: { card: card(BY_AGENT) } } });
  });

  test("is the card this exchange drew when it drew one, else the one card on screen, else nothing", () => {
    const drawAndSend = exchange("q2", "ยอดเอเย่นต์ แล้วส่งการ์ดนี้ให้พี่อนุชา", [metric("m2", BY_AGENT), pending("s1", "send_card", { to: ["พี่อนุชา"] })]);
    expect(cardNamed(lastScreen([SALES, drawAndSend]), undefined)).toMatchObject({ kind: "card", card: { target: { card: card(BY_AGENT) } } });
    const sendOnly = exchange("q2", "ส่งการ์ดนี้ให้คุณกฤตดูหน่อย", [pending("s1", "send_card", { to: ["คุณกฤต"] })]);
    expect(cardNamed(lastScreen([SALES, sendOnly]), undefined)).toMatchObject({ kind: "card", card: { exchangeId: "q1" } });
    expect(cardNamed(lastScreen([sendOnly]), undefined)).toEqual({ kind: "none" });
  });

  test("with two cards on screen and none named, is not a choice: the newest card is never taken for it", () => {
    const both = exchange("q1", "ยอดขายเข้ากับหนี้ค้างของอีสานรุ่งโรจน์", [metric("m1", BY_AGENT), metric("m2", OVERDUE)]);
    const send = exchange("q2", "ส่งการ์ดยอดขายเข้าใบนี้ให้คุณอนุชาเลย", [pending("s1", "send_card", { to: ["u_anucha"] })]);
    const screen = lastScreen([both, send]);
    expect(cardNamed(screen, undefined)).toMatchObject({ kind: "unclear", cards: [{ target: { card: card(BY_AGENT) } }, { target: { card: card(OVERDUE) } }] });
    expect(cardNamed(screen, cardRefOf(card(BY_AGENT)))).toMatchObject({ kind: "card", card: { target: { card: card(BY_AGENT) } } });
    expect(cardNamed(screen, ` ${cardRefOf(card(BY_AGENT)).toUpperCase()} `)).toMatchObject({ kind: "card" });
    expect(cardNamed(screen, "c0")).toMatchObject({ kind: "unknown", ref: "c0" });
  });

  test("lists a card drawn twice once, at its latest, and remembers a send held back for a contradiction from the next exchange on", () => {
    const again = exchange("q2", "ยอดขายแยกตามภาคอีกที", [metric("m3", BY_REGION)]);
    const held = exchange("q3", "ส่งให้พี่อนุชา บอกว่าเกินเป้าแล้ว", [returned("s1", "send_card", { to: ["u_anucha"] }, { ok: false, code: "ASK_CONTRADICTS_CARD", error: "ยังไม่ได้ส่ง" })]);
    const insist = exchange("q4", "ส่งไปเลย", [pending("s2", "send_card", { to: ["u_anucha"] })]);
    const screens = screenCardsEach([SALES, again, held, insist], CARD_TOOLS);
    expect(screens[1].cards.map((drawn) => drawn.exchangeId)).toEqual(["q2"]);
    expect(screens.map((screen) => screen.warned)).toEqual([false, false, false, true]);
  });

  test("is never a refusal, an empty answer or the metric catalog", () => {
    const refused = exchange("q2", "กำไร", [returned("m2", "query_metric", BY_REGION, { ok: false, error: "PERMISSION_DENIED" })]);
    const empty = exchange("q3", "ยอดว่าง", [returned("m3", "query_metric", BY_REGION, { ok: true, rows: [] })]);
    const catalog = exchange("q4", "มี metric อะไรบ้าง", [returned("c1", "list_metrics", {}, { ok: true, metrics: [{ id: "x" }] })]);
    expect(lastScreen([SALES, refused, empty, catalog]).cards.map((drawn) => drawn.exchangeId)).toEqual(["q1"]);
    expect(lastScreen([refused, empty, catalog]).cards).toEqual([]);
  });
});

describe("the figure the send approval shows for a card", () => {
  test("is the hero the drawn card leads with, not the sum of its rows", async () => {
    const args = { metric: "net_sales_volume", dims: ["agent"], grain: "month", range: { from: "2026-11-01", to: "2026-11-26" }, compare: "target", filters: { region: ["northeast"] }, sort: "value_desc", limit: 10 };
    const ceo = findUser("u_thana");
    if (!ceo) throw new Error("no u_thana");
    const result = await runWithAccess(liveAccessFor(ceo), () => winyuTools().query_metric.execute(args, { toolCallId: "m-hero" }));
    const answer = metricAnswerOf(result);
    if (!answer) throw new Error("the query answered nothing");
    const drawn = presentCard({ title: metricTitle(result, args), query: answer.query, result: answer, actions: answer.nextActions }).hero;
    if (!drawn) throw new Error("the card draws no hero");
    expect(drawn.value).not.toBe(answer.headline.value);
    const [screen] = screenCardsEach([exchange("q1", "ยอดเอเย่นต์อีสานเทียบเป้า", [returned("m-hero", "query_metric", args, result)])], CARD_TOOLS);
    expect(screen.cards[0]?.hero).toBe(drawn.unit ? `${drawn.value} ${drawn.unit}` : drawn.value);
  });

  test("a why card is named by its metric and split and shows its verdict figure, the week's 248.1 ล้านบาท and its −9.3% (AI-267)", () => {
    const args = { range: { to: "2026-11-26", from: "2026-11-23" }, split: "region", metric: "net_sales_value", compare: "prev_period", filters: {} };
    const answer = { ok: true, summary: "", period_label: "23 พ.ย. 2569 – 26 พ.ย. 2569", actual_label: "248.1 ล้านบาท", compare_label: "สัปดาห์ก่อน 273.6 ล้านบาท", gap_label: "−25.5 ล้านบาท", change_label: "−9.3%", attainment_label: null, contributors: [{ label: "กรุงเทพฯ และปริมณฑล", gap_label: "−5.9 ล้านบาท", share_label: "23.0% ของช่องว่าง" }], rest: null, offsetting: [], projection: null };
    const [screen] = screenCardsEach([exchange("q1", "ยอดขายสัปดาห์นี้ตกจากสัปดาห์ก่อนใช่ไหม ทำไมตกอะ", [returned("g1", "explain_gap", args, answer)])], new Set(["explain_gap"]));
    expect(screen.cards[0]).toMatchObject({ title: "มูลค่าขายเข้า · รายภาค", hero: "248.1 ล้านบาท −9.3%" });
  });

  test("an anomaly card leads with the alert it draws first, by place, metric and signed gap, not a bare title (AI-297)", async () => {
    const args = { dims: { region: "northeast" }, status: "open" };
    const ceo = findUser("u_thana");
    if (!ceo) throw new Error("no u_thana");
    const result = await runWithAccess(liveAccessFor(ceo), () => winyuTools().get_alerts.execute(args, { toolCallId: "a-hero" }));
    const [screen] = screenCardsEach([exchange("q1", "อีสานมีอะไรผิดปกติ", [returned("a-hero", "get_alerts", args, result)])], new Set(["get_alerts"]));
    expect(screen.cards[0]).toMatchObject({ title: "ความผิดปกติที่ต้องดู", hero: "อีสานรุ่งโรจน์ ค้าส่ง · ปริมาณขายเข้า −89%" });
  });
});
