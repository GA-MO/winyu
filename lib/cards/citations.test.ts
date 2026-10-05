import { describe, expect, test } from "bun:test";
import { citedName, splitByCitation } from "./citations";

const CREDIT_DAYS = { title: "นโยบายการขายและเครดิตเอเย่นต์", section: "ระดับเอเย่นต์และเครดิต › ระยะเวลาเครดิตตามระดับ" };
const GRADING = { title: "นโยบายการขายและเครดิตเอเย่นต์", section: "ระดับเอเย่นต์และเครดิต › การจัดระดับเอเย่นต์" };
const SHIFTS = { title: "คู่มือพนักงาน", section: "เวลาทำงาน › กะการทำงานโรงงานและศูนย์กระจายสินค้า" };

describe("splitByCitation", () => {
  test("a named section beats a passage that only shares its parent section or document", () => {
    expect(splitByCitation([GRADING, CREDIT_DAYS, SHIFTS], "ตามหมวดระยะเวลาเครดิตตามระดับ ได้ 30 วัน")).toEqual({ cited: [CREDIT_DAYS], searched: [GRADING, SHIFTS] });
  });

  test("a reply naming only a document cites every passage of that document", () => {
    expect(splitByCitation([GRADING, SHIFTS, CREDIT_DAYS], "ตามนโยบายการขายและเครดิตเอเย่นต์ ได้ 30 วัน")).toEqual({ cited: [GRADING, CREDIT_DAYS], searched: [SHIFTS] });
  });

  test("a not-found reply that names the document it looked in cites nothing, but one that names a section still cites it", () => {
    expect(splitByCitation([SHIFTS, CREDIT_DAYS], "ไม่พบเรื่องสัตว์เลี้ยงในคู่มือพนักงาน")).toEqual({ cited: [], searched: [SHIFTS, CREDIT_DAYS] });
    expect(splitByCitation([SHIFTS, CREDIT_DAYS], "ไม่พบเรื่องค่าล่วงเวลา แต่หมวดกะการทำงานโรงงานและศูนย์กระจายสินค้าบอกค่ากะ")).toEqual({ cited: [SHIFTS], searched: [CREDIT_DAYS] });
  });

  test("a reply naming nothing cites nothing", () => {
    expect(splitByCitation([CREDIT_DAYS, SHIFTS], "ไม่พบในเอกสาร")).toEqual({ cited: [], searched: [CREDIT_DAYS, SHIFTS] });
    expect(citedName(CREDIT_DAYS, "ได้ 30 วันครับ")).toBeNull();
  });
});
