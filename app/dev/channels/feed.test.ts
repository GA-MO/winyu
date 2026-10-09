import { describe, expect, test } from "bun:test";
import type { Sent } from "@/scripts/channels-sim";
import { chatOf, paneLinkOf } from "./feed";

const PAGE = { protocol: "http:", hostname: "localhost", port: "3100" };

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

describe("a link pressed in a pane", () => {
  test("into this Winyu opens on the other loopback host signed in as the pane's persona", () => {
    expect(paneLinkOf("http://localhost:3100/s/abc?x=1", PAGE, "u_krit")).toBe("http://127.0.0.1:3100/dev/as?user=u_krit&next=%2Fs%2Fabc%3Fx%3D1");
    expect(paneLinkOf("http://localhost:3100/s/abc", { ...PAGE, hostname: "127.0.0.1" }, "u_krit")).toBe("http://localhost:3100/dev/as?user=u_krit&next=%2Fs%2Fabc");
  });

  test("anywhere else opens as it is", () => {
    expect(paneLinkOf("https://winyu.example.com/s/abc", PAGE, "u_krit")).toBe("https://winyu.example.com/s/abc");
    expect(paneLinkOf("http://localhost:3299/x", PAGE, "u_krit")).toBe("http://localhost:3299/x");
  });
});
