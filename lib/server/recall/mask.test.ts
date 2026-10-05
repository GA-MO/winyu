import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { maskNumbers, truncate } from "./mask";

const MASK = TH.memory.maskedNumber;

describe("maskNumbers", () => {
  test("every Arabic or Thai digit run goes, separators inside a number included", () => {
    expect(maskNumbers("ยอดขาย 1,234.5 ล้านบาท ณ 22/09/2569 เวลา 10:30 ช่วง 2026-09-01 โต ๑๒.๕%")).toBe(`ยอดขาย ${MASK} ล้านบาท ณ ${MASK} เวลา ${MASK} ช่วง ${MASK} โต ${MASK}%`);
  });

  test("text without digits is left as it is, and no digit survives", () => {
    expect(maskNumbers("ฝ่ายขายน่าห่วงที่สุด")).toBe("ฝ่ายขายน่าห่วงที่สุด");
    expect(maskNumbers("อัตรา 8.2% กับ 3 ฝ่าย, ปี ๒๕๖๙")).not.toMatch(/[0-9๐-๙]/);
  });
});

describe("truncate", () => {
  test("short text stays whole and long text is cut to the limit with a mark", () => {
    expect(truncate("  สั้น  ", 10)).toBe("สั้น");
    const cut = truncate("ก".repeat(30), 10);
    expect([...cut]).toHaveLength(10);
    expect(cut.endsWith(TH.memory.truncated)).toBe(true);
  });
});
