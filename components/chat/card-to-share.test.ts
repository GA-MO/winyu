import { describe, expect, test } from "bun:test";
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
