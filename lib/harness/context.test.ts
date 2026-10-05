import { describe, expect, test } from "bun:test";
import { REQUIRED_PRIORITY, transcriptWindow, withinBudget } from "./context";
import type { ContextItem } from "./types";

function item(id: string, priority: number, chars: number): ContextItem {
  return { id, kind: "memory", content: "x".repeat(chars), priority, source: "test", scope: null };
}

function message(role: string, chars: number) {
  return { role, parts: [{ type: "text", text: "y".repeat(chars) }] };
}

describe("withinBudget", () => {
  test("drops the lowest priority first and keeps the rest in their given order", () => {
    const items = [item("a", 50, 40), item("b", 20, 40), item("c", 70, 40)];
    const { kept, dropped } = withinBudget(items, 90);
    expect(kept.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(dropped.map((entry) => entry.id)).toEqual(["b"]);
  });

  test("never drops a required item, even past the budget", () => {
    const { kept } = withinBudget([item("who", REQUIRED_PRIORITY, 500), item("extra", 60, 10)], 100);
    expect(kept.map((entry) => entry.id)).toEqual(["who"]);
  });
});

describe("transcriptWindow", () => {
  test("keeps everything that fits", () => {
    const messages = [message("user", 10), message("assistant", 10)];
    expect(transcriptWindow(messages, 10_000, 2)).toEqual({ kept: messages, dropped: 0 });
  });

  test("drops the oldest messages until the rest fit, then widens back to open on the person's own message", () => {
    const messages = [message("user", 400), message("assistant", 400), message("user", 400), message("assistant", 400), message("user", 50), message("assistant", 50), message("user", 50)];
    const { kept, dropped } = transcriptWindow(messages, 1_000, 2);
    expect(dropped).toBe(2);
    expect(kept).toEqual(messages.slice(2));
  });

  test("never cuts below the floor", () => {
    const messages = [message("user", 900), message("assistant", 900), message("user", 900)];
    expect(transcriptWindow(messages, 100, 2).kept.length).toBeGreaterThanOrEqual(2);
  });
});
