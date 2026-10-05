import { describe, expect, test } from "bun:test";
import type { NextAction } from "@/lib/contracts";
import { askAction } from "@/components/cards/card-actions";
import { parsePressed, pressFromParam, pressedText } from "@/components/chat/pressed";
import { actionHref, chatHref } from "./chat-entry";

const PIN: NextAction = { id: "pin", kind: "pin", label: "ปักไว้บน Dashboard", reason: "", tool: "pin_widget", input: { title: "x" }, prompt: null };
const DRILL: NextAction = { id: "drill", kind: "drill", label: "แยกตามภาค", reason: "", tool: null, input: null, prompt: "ยอดขายแยกตามภาค" };
const EMPTY: NextAction = { ...DRILL, prompt: null };

describe("chat entry links", () => {
  test("each entry kind becomes the /c/new query the chat reads", () => {
    expect(chatHref({ prompt: "ยอดขาย & เป้า" })).toBe(`/c/new?prompt=${encodeURIComponent("ยอดขาย & เป้า")}`);
    expect(chatHref({ preload: "p1" })).toBe("/c/new?preload=p1");
    expect(chatHref({ story: "s1" })).toBe("/c/new?story=s1");
  });

  test("a card button outside the chat asks its question, or carries its tool and exact input as the in-chat button sends them", () => {
    expect(actionHref(DRILL)).toBe(chatHref({ prompt: "ยอดขายแยกตามภาค" }));
    const press = pressFromParam(new URL(actionHref(PIN) ?? "", "http://x").searchParams.get("press") ?? "");
    expect(press).toEqual({ tool: "pin_widget", input: { title: "x" }, label: "ปักไว้บน Dashboard" });
    expect(parsePressed(pressedText(press ?? { tool: "", input: {} }))).toEqual({ tool: "pin_widget", input: { title: "x" } });
    expect(actionHref(askAction("ใครดูแลอีสาน"))).toBe(chatHref({ prompt: "ใครดูแลอีสาน" }));
    expect(actionHref(EMPTY)).toBeNull();
  });
});
