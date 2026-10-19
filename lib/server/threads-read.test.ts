import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { titleFrom } from "./threads-read";

describe("titleFrom", () => {
  test("keeps a whole question so the sidebar, not the store, decides where it is cut", () => {
    const question = "สต๊อกพอขายกี่วัน รายสัปดาห์ 3 เดือนที่ผ่านมา แยกตามศูนย์กระจายสินค้า";
    expect(titleFrom(question)).toBe(question);
  });

  test("marks a title it had to shorten with an ellipsis instead of ending mid-word", () => {
    const title = titleFrom("ก".repeat(200));
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThan(200);
  });

  test("an empty first message names a new thread", () => {
    expect(titleFrom("   ")).toBe(TH.session.newThreadTitle);
  });
});
