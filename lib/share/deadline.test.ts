import { describe, expect, test } from "bun:test";
import { writtenDeadline } from "./deadline";
import { matterDeadline } from "./matter";

const WEDNESDAY = "2026-10-14";
const FRIDAY = "2026-10-16";

function dueOf(text: string, today = WEDNESDAY): string | null {
  const deadline = writtenDeadline(text, today);
  return deadline?.kind === "day" ? deadline.day : null;
}

describe("the deadline the sender wrote (AI-120)", () => {
  test("common Thai deadlines become the day they fall on", () => {
    expect(dueOf("โทรตามหนี้วารินพาณิชย์ภายในพรุ่งนี้ แล้วตอบกลับมา")).toBe("2026-10-15");
    expect(dueOf("คุยแผนชำระแล้วแจ้งพี่ภายในศุกร์นี้นะ")).toBe(FRIDAY);
    expect(dueOf("ขอคำตอบก่อนศุกร์")).toBe(FRIDAY);
    expect(dueOf("ขอภายในวันนี้")).toBe(WEDNESDAY);
    expect(dueOf("ขอมะรืนนี้")).toBe(FRIDAY);
    expect(dueOf("ส่งให้ภายในวันที่ 20")).toBe("2026-10-20");
    expect(dueOf("ส่งให้ภายในวันที่ 3")).toBe("2026-11-03");
    expect(dueOf("ภายในวันอาทิตย์")).toBe("2026-10-18");
    expect(dueOf("ขอสัปดาห์หน้า")).toBe("2026-10-23");
  });

  test("this week is a week, not a day; a weekday named as data is no deadline", () => {
    expect(writtenDeadline("ฝากดูภายในอาทิตย์นี้", WEDNESDAY)).toEqual({ kind: "this_week" });
    expect(writtenDeadline("ฝากดูภายในสัปดาห์", WEDNESDAY)).toEqual({ kind: "this_week" });
    expect(writtenDeadline("ยอดขายวันจันทร์ตกเยอะ ส่งให้พี่อนุชาดู", WEDNESDAY)).toBeNull();
    expect(writtenDeadline("ส่งการ์ดนี้ให้พี่อนุชา", WEDNESDAY)).toBeNull();
  });

  test("a matter sent from chat is due on the day written, urgent today only when that day is today", () => {
    expect(matterDeadline(undefined, "โทรตามหนี้ภายในพรุ่งนี้", "act", WEDNESDAY)).toEqual({ urgency: "this_week", due: "2026-10-15" });
    expect(matterDeadline(undefined, "แจ้งพี่ภายในศุกร์นี้", "act", FRIDAY)).toEqual({ urgency: "today", due: FRIDAY });
    expect(matterDeadline(undefined, "ด่วน ขอภายในพรุ่งนี้", "act", WEDNESDAY)).toEqual({ urgency: "now", due: "2026-10-15" });
    expect(matterDeadline("now", "ฝากดูหน่อย", "act", WEDNESDAY)).toEqual({ urgency: "today", due: null });
  });
});
