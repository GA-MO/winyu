import { describe, expect, test } from "bun:test";
import { pressedText } from "./pressed";
import { exchangesOf, type ChatMessage } from "./timeline";
import { composedCalls, isEmptyAnswer, toolViewOf, type ToolLive } from "./tool-view";
import { sinceLastQuestion } from "@/components/providers/copilot-provider";

const CARD_TOOLS = new Set(["query_metric"]);
const IDLE: ToolLive = { running: false, asking: false, decided: undefined, composed: false };

function call(id: string, name: string, args: unknown = {}) {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

const TRANSCRIPT: ChatMessage[] = [
  { id: "u1", role: "user", content: "ยอดขายแยกตามภาค" },
  { id: "a1", role: "assistant", content: "", toolCalls: [call("c1", "query_metric", { metric: "net_sales_value" })] },
  { id: "t1", role: "tool", toolCallId: "c1", content: JSON.stringify({ ok: true, rows: [{ region: "อีสาน" }] }) },
  { id: "a2", role: "assistant", content: "อีสานต่ำกว่าเป้า" },
  { id: "u2", role: "user", content: pressedText({ tool: "pin_widget", input: { title: "ยอดขาย" } }) },
  { id: "a3", role: "assistant", content: "", toolCalls: [call("c2", "pin_widget", { title: "ยอดขาย" })] },
];

describe("exchangesOf", () => {
  test("groups each question with its reply steps in order, joins results to calls, and reads a pressed button back as its tool", () => {
    const exchanges = exchangesOf(TRANSCRIPT);
    expect(exchanges.map((exchange) => exchange.id)).toEqual(["u1", "u2"]);
    expect(exchanges[0].steps.map((step) => step.kind)).toEqual(["tool", "text"]);
    expect(exchanges[0].steps[0]).toMatchObject({ name: "query_metric", args: { metric: "net_sales_value" }, outcome: { state: "returned", result: { ok: true, rows: [{ region: "อีสาน" }] } } });
    expect(exchanges[1].question).toEqual({ kind: "pressed", tool: "pin_widget", input: { title: "ยอดขาย" } });
    expect(exchanges[1].steps[0]).toMatchObject({ toolCallId: "c2", outcome: { state: "pending" } });
  });

  test("a colleague's handoff reply joins the exchange it followed as a reply step, never as a new question", () => {
    const note = { packetId: "p1", packetTitle: "ตรวจยอดขาย", fromName: "อนุชา", fromTitle: "RSM ภาคเหนือ", status: "accepted" as const, text: "รับแล้วครับ", at: "2026-10-05T03:00:00.000Z" };
    const exchanges = exchangesOf([...TRANSCRIPT, { id: "r1", role: "activity", activityType: "handoff-reply", content: note }]);
    expect(exchanges.map((exchange) => exchange.id)).toEqual(["u1", "u2"]);
    expect(exchanges[1].steps.at(-1)).toEqual({ kind: "handoff-reply", id: "r1", note });
  });
});

describe("toolViewOf", () => {
  const [first, second] = exchangesOf(TRANSCRIPT);
  const read = first.steps[0];
  const write = second.steps[0];
  if (read.kind !== "tool" || write.kind !== "tool") throw new Error("fixture");

  test("a read tool's result is its card; while it runs it is a working line; an empty answer draws nothing", () => {
    expect(toolViewOf(read, IDLE, CARD_TOOLS)).toMatchObject({ kind: "card", name: "query_metric" });
    expect(toolViewOf({ ...read, outcome: { state: "pending" } }, { ...IDLE, running: true }, CARD_TOOLS)).toEqual({ kind: "working" });
    expect(isEmptyAnswer({ ok: true, summary: "ยังไม่มีพยากรณ์", weeks: [] })).toBe(true);
    expect(toolViewOf({ ...read, outcome: { state: "returned", result: { ok: true, weeks: [] } } }, IDLE, CARD_TOOLS)).toEqual({ kind: "none" });
  });

  test("a write waits on the person, works while the answer runs, and shows a receipt only for the result it earned", () => {
    expect(toolViewOf(write, { ...IDLE, asking: true }, CARD_TOOLS)).toMatchObject({ kind: "decision", approved: null });
    expect(toolViewOf(write, { ...IDLE, running: true, decided: true }, CARD_TOOLS)).toEqual({ kind: "working" });
    expect(toolViewOf(write, { ...IDLE, decided: true }, CARD_TOOLS)).toEqual({ kind: "not-run" });
    expect(toolViewOf({ ...write, outcome: { state: "returned", result: { ok: true } } }, IDLE, CARD_TOOLS)).toMatchObject({ kind: "decision", approved: true });
    expect(toolViewOf({ ...write, outcome: { state: "returned", result: { approved: false } } }, IDLE, CARD_TOOLS)).toMatchObject({ kind: "decision", approved: false });
    expect(toolViewOf({ ...write, outcome: { state: "returned", result: { ok: false, error: "x" } } }, IDLE, CARD_TOOLS)).toEqual({ kind: "none" });
    expect(toolViewOf(write, IDLE, CARD_TOOLS)).toEqual({ kind: "not-run" });
  });
});

describe("composedCalls", () => {
  function peopleTurn(composed: unknown): ChatMessage[] {
    return [
      { id: "u1", role: "user", content: "ใครดูแลภาคอีสาน" },
      { id: "a1", role: "assistant", content: "", toolCalls: [call("p1", "find_people"), call("p2", "get_person"), call("m1", "query_metric")] },
      { id: "t1", role: "tool", toolCallId: "p1", content: JSON.stringify({ ok: true, data: [] }) },
      { id: "t2", role: "tool", toolCallId: "p2", content: JSON.stringify({ ok: true, data: {} }) },
      { id: "t3", role: "tool", toolCallId: "m1", content: JSON.stringify({ ok: true, rows: [] }) },
      { id: "a2", role: "assistant", content: "", toolCalls: [call("k1", "compose_card")] },
      { id: "t4", role: "tool", toolCallId: "k1", content: JSON.stringify(composed) },
    ];
  }

  test("a composed card is the answer: no fixed card of a composable read beside it, the metric card stays", () => {
    const [exchange] = exchangesOf(peopleTurn({ ok: true, summary: "", a2ui_operations: [] }));
    expect([...composedCalls(exchange.steps, false)].sort()).toEqual(["p1", "p2"]);
  });

  test("a refused composition leaves every fixed card as the fallback, and a streaming reply holds them back until it ends", () => {
    const [exchange] = exchangesOf(peopleTurn({ ok: false, error: "การ์ดนี้ใช้ไม่ได้" }));
    expect([...composedCalls(exchange.steps, false)]).toEqual([]);
    expect([...composedCalls(exchange.steps, true)].sort()).toEqual(["p1", "p2"]);
  });
});

describe("sinceLastQuestion", () => {
  test("sends the newest question and what followed it, never the history Mastra memory already holds", () => {
    expect(sinceLastQuestion(TRANSCRIPT).map((message) => message.id)).toEqual(["u2", "a3"]);
  });
});
