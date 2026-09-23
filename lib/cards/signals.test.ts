import { describe, expect, test } from "bun:test";
import type { AlertRow } from "@/lib/contracts";
import { presentAlerts, type SignalItem } from "./present";

function rowOf(overrides: Partial<AlertRow>): AlertRow {
  return {
    id: "a1",
    severity: "P1",
    severityLabel: "ต้องรีบดู",
    metric: "net_sales_volume",
    metricLabel: "ปริมาณขายเข้า (Sell-in)",
    scope: {},
    scopeLabel: "อุบลศรีสุข เทรดดิ้ง · ภาคอีสาน",
    window: "",
    observedLabel: "2,547 ลิตร",
    expectedLabel: "13,059 ลิตร",
    gapLabel: "80%",
    yearOverYear: false,
    direction: "down",
    hypothesis: "แทบไม่มีคำสั่งซื้อเข้ามา",
    verifySteps: [],
    ownerUserId: "u_anucha",
    ...overrides,
  };
}

function signalsOf(rows: AlertRow[]): SignalItem[] {
  const body = presentAlerts({ title: "ความผิดปกติ", alerts: rows }).body;
  if (body.kind !== "alerts") throw new Error("not an alert body");
  return body.items;
}

describe("alert rows", () => {
  test("the entity is the name, the gap is signed and coloured by harm, the cause waits behind a toggle", () => {
    const [signal] = signalsOf([rowOf({})]);
    expect(signal?.name).toBe("อุบลศรีสุข เทรดดิ้ง");
    expect(signal?.place).toBe("ภาคอีสาน · ปริมาณขายเข้า");
    expect(signal?.gap).toBe("−80%");
    expect(signal?.gapTone).toBe("bad");
    expect(signal?.numbers).toBe("จริง 2,547 ลิตร · คาด 13,059 ลิตร");
    expect(signal?.why).toBe("แทบไม่มีคำสั่งซื้อเข้ามา");
  });

  test("overdue money rising is bad news, and a year-over-year ratio is shown once", () => {
    const [signal] = signalsOf([
      rowOf({ metric: "ar_overdue", metricLabel: "ยอดค้างชำระเกินกำหนด", scopeLabel: "ภาคใต้", direction: "up", gapLabel: "70%", yearOverYear: true, observedLabel: "1.7 เท่าของปีก่อน" }),
    ]);
    expect(signal?.name).toBe("ภาคใต้");
    expect(signal?.place).toBe("ยอดค้างชำระเกินกำหนด");
    expect(signal?.gap).toBe("+70%");
    expect(signal?.gapTone).toBe("bad");
    expect(signal?.numbers).toBe("1.7 เท่าของปีก่อน");
  });

  test("a cause already told on an earlier row is not repeated", () => {
    const signals = signalsOf([rowOf({ id: "a1" }), rowOf({ id: "a2", scopeLabel: "อีสานรุ่งโรจน์ ค้าส่ง · ภาคอีสาน" })]);
    expect(signals[1]?.why).toBeNull();
  });
});
