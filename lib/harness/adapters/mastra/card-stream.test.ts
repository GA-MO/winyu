import { beforeAll, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { COMPOSED_CARD_ACTIVITY, type ComposedSurface } from "@/lib/compose/catalog";
import { GEMINI_TEAM_CARD } from "@/lib/compose/gemini-team-card";
import { findUser } from "@/lib/data/entities/users";
import { toolTiers, winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { ReplyCards, withComposedCards, type ComposedCardRecord, type StreamEvent } from "./card-stream";
import { agUiMessagesOf, type StoredMessage } from "./history";

const TEXT_ID = "m-text";
const INTRO = "คุณอนุชา พรหมศรี ดูแลภาคอีสาน ทีมของเขาอยู่ในการ์ดนี้\n\n";
const OUTRO = "ควรติดตามใบอนุญาตที่ใกล้หมดอายุ";
const CHUNK = 37;
const READS = [
  { id: "c1", tool: "find_people", input: { manager: "u_anucha", region: null, department: null, query: null, flag: null } },
  { id: "c2", tool: "get_person", input: { id: "u_anucha", name: "" } },
];

let outputs: unknown[] = [];

const BROKEN = { ...GEMINI_TEAM_CARD[8], title: { path: "/get_person/data/salary" } };
const BLOCK_LINES = GEMINI_TEAM_CARD.map((component) => JSON.stringify(component.id === BROKEN.id ? BROKEN : component));
const REPLY = `${INTRO}\`\`\`a2ui\n${BLOCK_LINES.join("\n")}\n\`\`\`\n${OUTRO}`;

function chunks(text: string): string[] {
  const out: string[] = [];
  for (let at = 0; at < text.length; at += CHUNK) out.push(text.slice(at, at + CHUNK));
  return out;
}

function liveEvents(): StreamEvent[] {
  return [
    { type: "RUN_STARTED" },
    ...READS.flatMap((read, index) => [
      { type: "TOOL_CALL_START", toolCallId: read.id, toolCallName: read.tool },
      { type: "TOOL_CALL_END", toolCallId: read.id },
      { type: "TOOL_CALL_RESULT", toolCallId: read.id, content: JSON.stringify(outputs[index]) },
    ]),
    { type: "TEXT_MESSAGE_START", messageId: TEXT_ID, role: "assistant" },
    ...chunks(REPLY).map((delta) => ({ type: "TEXT_MESSAGE_CONTENT", messageId: TEXT_ID, delta })),
    { type: "TEXT_MESSAGE_END", messageId: TEXT_ID },
    { type: "RUN_FINISHED" },
  ];
}

function readTool(tool: string): boolean {
  return toolTiers()[tool] === "read";
}

function streamed(): { out: StreamEvent[]; records: ComposedCardRecord[] } {
  const records: ComposedCardRecord[] = [];
  const cards = new ReplyCards(readTool, (record) => records.push(record));
  return { out: liveEvents().flatMap((event) => cards.next(event)), records };
}

function snapshots(events: readonly StreamEvent[]): ComposedSurface[] {
  return events.filter((event) => event.type === "ACTIVITY_SNAPSHOT").map((event) => event.content as ComposedSurface);
}

function shownText(events: readonly StreamEvent[]): string {
  return events.flatMap((event) => (event.type === "TEXT_MESSAGE_CONTENT" ? [String(event.delta)] : [])).join("");
}

beforeAll(async () => {
  const user = findUser("u_thana");
  if (!user) throw new Error("no CEO");
  const tools = winyuTools();
  outputs = await runWithAccess(accessFor(user), () => Promise.all(READS.map((read) => tools[read.tool].execute(tools[read.tool].inputSchema().parse(read.input)))));
});

describe("a card block streamed in the reply", () => {
  test("the person reads the words around the block, never the block itself", () => {
    const { out } = streamed();
    expect(shownText(out)).toBe(`${INTRO}${OUTRO}`);
    expect(out.every((event) => event.type !== "TEXT_MESSAGE_CONTENT" || String(event.delta).length > 0)).toBe(true);
  });

  test("the card reaches the chat as it grows, each snapshot only lines that held, and the last one marks it done", () => {
    const { out, records } = streamed();
    const cards = snapshots(out);
    expect(cards.length).toBeGreaterThan(2);
    expect(cards.map((card) => card.components.length)).toEqual([...cards.map((card) => card.components.length)].sort((left, right) => left - right));
    expect(cards.slice(0, -1).every((card) => !card.done)).toBe(true);
    const last = cards.at(-1);
    expect(last?.done).toBe(true);
    expect(last?.components.map((component) => component.id)).not.toContain(BROKEN.id);
    expect(last?.components).toHaveLength(GEMINI_TEAM_CARD.length - 1);
    expect(records).toEqual([{ surfaceId: `${TEXT_ID}:card:1`, accepted: GEMINI_TEAM_CARD.length - 1, rejected: 1, problems: [expect.stringContaining("/get_person/data/salary")] }]);
    expect(out.findIndex((event) => event.type === "ACTIVITY_SNAPSHOT")).toBeLessThan(out.findIndex((event) => event.type === "TEXT_MESSAGE_END"));
  });

  test("a reload draws the same card from the stored reply text and the stored tool results", () => {
    const live = snapshots(streamed().out).at(-1);
    const stored: StoredMessage[] = [
      { id: "u1", role: "user", content: { format: 2, parts: [{ type: "text", text: "ใครดูแลภาคอีสาน ขอข้อมูลคนนั้นและทีมของเขาหน่อย" }] } },
      {
        id: "a1",
        role: "assistant",
        content: {
          format: 2,
          parts: [
            ...READS.map((read, index) => ({ type: "tool-invocation", toolInvocation: { state: "result", toolCallId: read.id, toolName: read.tool, args: read.input, result: outputs[index] } })),
            { type: "text", text: REPLY },
          ],
        },
      },
    ];
    const restored = agUiMessagesOf(stored);
    const card = restored.find((message) => message.role === "activity" && message.activityType === COMPOSED_CARD_ACTIVITY);
    const content = (card as { content?: ComposedSurface } | undefined)?.content;
    expect(content?.components).toEqual(live?.components as ComposedSurface["components"]);
    expect(content?.dataModel).toEqual(live?.dataModel as Record<string, unknown>);
    expect(restored.find((message) => message.role === "assistant" && message.id === "a1:1")).toMatchObject({ content: `${INTRO}${OUTRO}` });
  });

  test("a reply with no block passes through untouched, byte for byte", async () => {
    const frames = ['data: {"type":"RUN_STARTED"}', 'data: {"type":"TEXT_MESSAGE_START","messageId":"m","role":"assistant"}', 'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":"สวัสดี"}', 'data: {"type":"TEXT_MESSAGE_END","messageId":"m"}', 'data: {"type":"RUN_FINISHED"}'].map((frame) => `${frame}\n\n`).join("");
    const response = new Response(frames);
    const rewritten = withComposedCards(response, new ReplyCards(readTool, () => undefined));
    expect(await rewritten.text()).toBe(frames);
  });
});
