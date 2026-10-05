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

  test("a reply naming nothing cites nothing", () => {
    expect(splitByCitation([CREDIT_DAYS, SHIFTS], "ไม่พบในเอกสาร")).toEqual({ cited: [], searched: [CREDIT_DAYS, SHIFTS] });
    expect(citedName(CREDIT_DAYS, "ได้ 30 วันครับ")).toBeNull();
  });
});
