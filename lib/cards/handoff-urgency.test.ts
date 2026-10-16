import { describe, expect, test } from "bun:test";
import { pressedText } from "@/components/chat/pressed";
import { handoffUrgency } from "./handoff-urgency";

describe("handoffUrgency", () => {
  test("a model's 'high' without the person asking for it is medium", () => {
    expect(handoffUrgency("high", "ฝากคุณกฤตไปเยี่ยมอุบลศรีสุขภายในสัปดาห์นี้")).toBe("medium");
    expect(handoffUrgency(undefined, "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน")).toBe("medium");
  });

  test("the person's own word for urgent makes it high, whatever the model passed", () => {
    expect(handoffUrgency(undefined, "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสานไปจัดการ ด่วน")).toBe("high");
    expect(handoffUrgency("medium", "urgent: hand this to the RSM")).toBe("high");
  });

  test("a pressed button keeps the urgency it carried", () => {
    const pressed = pressedText({ tool: "create_handoff", input: { toUserId: "u_may", urgency: "high" } });
    expect(handoffUrgency("high", pressed)).toBe("high");
    expect(handoffUrgency(undefined, pressed)).toBe("medium");
  });
});
