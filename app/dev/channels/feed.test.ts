import { describe, expect, test } from "bun:test";
import type { Sent } from "@/scripts/channels-sim";
import { chatOf } from "./feed";

function entry(seq: number, channel: Sent["channel"], thread: string, kind: string, body: unknown): Sent {
  return { seq, channel, to: thread, thread, kind, body };
}

describe("a pane's chat", () => {
  test("keeps only its own thread and types until Winyu answers", () => {
    const entries = [
      entry(1, "line", "Ukrit", "inbound", { name: "กฤษณ์", text: "ยอดขาย" }),
      entry(2, "line", "Uother", "inbound", { name: "x", text: "อื่น" }),
      entry(3, "line", "Ukrit", "loading", null),
    ];
    expect(chatOf(entries, "line", "Ukrit")).toEqual({ bubbles: [{ kind: "mine", seq: 1, text: "ยอดขาย" }], typing: true });
    const answered = [...entries, entry(4, "line", "Ukrit", "reply", { messages: [{ type: "flex", contents: { body: { type: "box" } } }] })];
    expect(chatOf(answered, "line", "Ukrit")).toEqual({ bubbles: [{ kind: "mine", seq: 1, text: "ยอดขาย" }, { kind: "flex", seq: 4, bubble: { body: { type: "box" } } }], typing: false });
  });

  test("draws a Teams card from its attachment and a notice from its text", () => {
    const entries = [entry(1, "teams", "a:dm-1", "message", { attachments: [{ content: { body: [] } }] }), entry(2, "teams", "a:dm-1", "message", { text: "ยังไม่ได้เปิดใช้" })];
    expect(chatOf(entries, "teams", "a:dm-1").bubbles.map((bubble) => bubble.kind)).toEqual(["adaptive", "text"]);
  });
});
