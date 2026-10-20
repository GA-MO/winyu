import { describe, expect, test } from "bun:test";
import type { MetricQuery } from "@/lib/contracts";
import { asksAmount, asksMonthEnd, rowsNamedIn } from "./asked";

const BY_UNIT = { metric: "gross_margin", dims: ["business_unit"], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "none", limit: null } as MetricQuery;
const UNITS = [{ business_unit: "กลุ่มนอนแอลกอฮอล์" }, { business_unit: "กลุ่มเบียร์" }, { business_unit: "กลุ่มนำเข้า" }];
const BY_AGENT = { ...BY_UNIT, metric: "ar_overdue", dims: ["agent"] } as MetricQuery;
const AGENTS = [{ agent: "ขอนแก่นมหาชัย" }, { agent: "โคราชสหภัณฑ์" }, { agent: "อุบลศรีสุข เทรดดิ้ง" }];

describe("the rows a question names", () => {
  test("by the whole label, the label without the prefix every row shares, or a first word no other row starts with", () => {
    expect(rowsNamedIn("มาร์จินกลุ่มเบียร์เดือนนี้ขึ้นไป 30% แล้วใช่ไหม", BY_UNIT, UNITS)).toEqual(["กลุ่มเบียร์"]);
    expect(rowsNamedIn("มาร์จินเบียร์เดือนนี้", BY_UNIT, UNITS)).toEqual(["กลุ่มเบียร์"]);
    expect(rowsNamedIn("ทั้งภาคค้างรวมเท่าไหร่ เทียบกับอุบลศรีสุข", BY_AGENT, AGENTS)).toEqual(["อุบลศรีสุข เทรดดิ้ง"]);
  });

  test("names nothing when the question names no row, every row, or there is no group to name", () => {
    expect(rowsNamedIn("กำไรขั้นต้นเดือนนี้", BY_UNIT, UNITS)).toEqual([]);
    expect(rowsNamedIn("เทียบนอนแอลกอฮอล์ เบียร์ และนำเข้า", BY_UNIT, UNITS)).toEqual([]);
    expect(rowsNamedIn(null, BY_UNIT, UNITS)).toEqual([]);
    expect(rowsNamedIn("กลุ่มเบียร์", { ...BY_UNIT, dims: ["month"] }, [{ month: "2026-11" }])).toEqual([]);
  });
});

describe("a question about where the month closes (AI-236)", () => {
  test("asks for the month end when it asks where the month will close or whether it will reach the target", () => {
    expect(asksMonthEnd("ทั้งบริษัทเดือนนี้จะปิดที่กี่เปอร์เซ็นต์ของเป้า แล้วปักการ์ดนั้นไว้ที่แดชบอร์ดให้หน่อย")).toBe(true);
    expect(asksMonthEnd("ถ้าเป็นแบบนี้ต่อไป ภาคอีสานจะปิดเดือนได้ถึงเป้าไหม")).toBe(true);
    expect(asksMonthEnd("เดือนนี้จะถึงเป้าไหม")).toBe(true);
  });

  test("a question about how far the month has come so far does not", () => {
    expect(asksMonthEnd("เดือนนี้ผมทำยอดได้ตามเป้าไหม ยังขาดอีกเท่าไหร่")).toBe(false);
    expect(asksMonthEnd("ทีมผมเดือนนี้ถึงเป้าแค่ไหนแล้ว เอเย่นต์ไหนน่าห่วงสุด")).toBe(false);
    expect(asksMonthEnd("เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว")).toBe(false);
    expect(asksMonthEnd(null)).toBe(false);
  });
});

describe("asksAmount (AI-349)", () => {
  test("a question for the amount asks for it", () => {
    expect(asksAmount("กลับไปที่ภาคแรกที่ดูเมื่อกี้ ยอดรวมเท่าไหร่")).toBe(true);
    expect(asksAmount("เดือนนี้ขายได้กี่ล้าน")).toBe(true);
    expect(asksAmount("ภาคใต้ยอดเท่าไร")).toBe(true);
  });

  test("a question for the share of target or the gap to it does not", () => {
    expect(asksAmount("เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว")).toBe(false);
    expect(asksAmount("เดือนนี้ผมทำยอดได้ตามเป้าไหม ยังขาดอีกเท่าไหร่")).toBe(false);
    expect(asksAmount("ยอดขายเดือนนี้แยกภาค")).toBe(false);
    expect(asksAmount(null)).toBe(false);
  });
});
