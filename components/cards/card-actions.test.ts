import { describe, expect, test } from "bun:test";
import type { NextAction } from "@/lib/contracts";
import { offeredActions } from "./card-actions";

const SEND_ANUCHA: NextAction = { id: "send", kind: "send", label: "ส่งให้คุณอนุชา", reason: "", tool: "send_card", input: { to: ["u_anucha"], ask: "ช่วยตรวจอีสานรุ่งโรจน์ ค้าส่ง" }, prompt: null };
const DRILL: NextAction = { id: "drill-why", kind: "drill", label: "ทำไมปากช่องเบเวอเรจถึงเป็นแบบนี้", reason: "", tool: null, input: null, prompt: "เจาะดู" };

describe("a card never offers to send itself to someone who already holds it (AI-281)", () => {
  test("the CEO's agent card, already sent to คุณอนุชา, leads with its next step instead of a second send", () => {
    expect(offeredActions([SEND_ANUCHA, DRILL], false, ["u_anucha"]).map((action) => action.id)).toEqual(["drill-why"]);
  });

  test("a send to someone the card has not reached stays, and none is offered beside a send the reply raises", () => {
    expect(offeredActions([SEND_ANUCHA, DRILL], false, ["u_krit"]).map((action) => action.id)).toEqual(["send", "drill-why"]);
    expect(offeredActions([SEND_ANUCHA, DRILL], true, []).map((action) => action.id)).toEqual(["drill-why"]);
  });
});
