import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { adoptGeneratedTitle, cleanGeneratedTitle, createThread, deleteThread, renameThread, titleFrom } from "./threads-read";

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

describe("a generated title", () => {
  const QUESTION = "ยอดขาย 3 เดือนล่าสุดของภาคใต้";

  test("is kept without quotes or closing punctuation, and shortened past 60 characters", () => {
    expect(cleanGeneratedTitle("“ยอดขายภาคใต้ 3 เดือน”.", QUESTION)).toBe("ยอดขายภาคใต้ 3 เดือน");
    expect(cleanGeneratedTitle("ก".repeat(80), QUESTION)?.endsWith("…")).toBe(true);
    expect(cleanGeneratedTitle("  \"\"  ", QUESTION)).toBeNull();
  });

  test("is refused when it carries a number the person did not type", () => {
    expect(cleanGeneratedTitle("ยอดขายภาคใต้ 12.4 ล้าน", QUESTION)).toBeNull();
  });

  test("replaces only the first question of the person's own thread: never a rename, a matter's title, a title already generated, or another person's thread", () => {
    const own = createThread("u_thana", QUESTION);
    const renamed = createThread("u_thana", QUESTION);
    renameThread(renamed.id, "u_thana", "ของฉัน");
    const matter = createThread("u_thana", "เรื่องสต๊อกภาคเหนือ", { matterCode: "M-1" });
    try {
      expect(adoptGeneratedTitle(own.id, "u_krit", "ยอดขายภาคใต้")).toBeNull();
      expect(adoptGeneratedTitle(own.id, "u_thana", "ยอดขายภาคใต้")).toMatchObject({ title: "ยอดขายภาคใต้", titledBy: "model", question: QUESTION });
      expect(adoptGeneratedTitle(own.id, "u_thana", "ชื่ออื่น")).toBeNull();
      expect(adoptGeneratedTitle(renamed.id, "u_thana", "ยอดขายภาคใต้")).toBeNull();
      expect(adoptGeneratedTitle(matter.id, "u_thana", "ยอดขายภาคใต้")).toBeNull();
    } finally {
      for (const thread of [own, renamed, matter]) deleteThread(thread.id, "u_thana");
    }
  });
});
