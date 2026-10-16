import { describe, expect, test } from "bun:test";
import type { MetricQuery } from "@/lib/contracts";
import { rowsNamedIn } from "./asked";

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
