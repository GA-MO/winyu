import { describe, expect, test } from "bun:test";
import { rowContradictionOf, sendWarning, type RowFigure } from "./figures";

const ROW: RowFigure = { label: "ขอนแก่นมหาชัย", change: -1.6, versus: "เทียบเป้าตามเวลา" };
const EARLIER = "ขอนแก่นมหาชัยตกหนัก ฝากคุณกฤตเข้าไปคุย";
const CLEAN_ASK = "ฝากคุณกฤตเข้าไปพูดคุยและติดตามยอดขายกับทางเอเย่นต์ (ขอนแก่นมหาชัย)";
const FOCUS = { row: ROW, claim: rowContradictionOf(EARLIER, ROW) };

describe("the warning a send shows (AI-220)", () => {
  test("a claim in earlier words warns until the conversation has pointed it out; then only the ask that goes out counts", () => {
    expect(sendWarning(CLEAN_ASK, null, FOCUS, false)).toBe(FOCUS.claim);
    expect(sendWarning(CLEAN_ASK, null, FOCUS, true)).toBeNull();
    expect(sendWarning(`ขอนแก่นมหาชัยตกหนัก ${CLEAN_ASK}`, null, FOCUS, true)).toBe(FOCUS.claim);
  });

  test("a fall is written with a minus sign, never an ASCII hyphen", () => {
    expect(FOCUS.claim).toContain("−1.6%");
    expect(FOCUS.claim).not.toContain("-1.6%");
  });
});
