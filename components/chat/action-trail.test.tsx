import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ActionTrail } from "./action-trail";
import type { ReplyStep } from "./timeline";
import { trailOf } from "./trail";

const SALES = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-30" } };
const STEPS: ReplyStep[] = [
  { kind: "tool", toolCallId: "a", name: "get_alerts", args: {}, outcome: { state: "returned", result: { ok: true, alerts: [] } } },
  { kind: "tool", toolCallId: "b", name: "query_metric", args: SALES, outcome: { state: "pending" } },
];

function rendered(streaming: boolean, steps: ReplyStep[]): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => createRoot(host).render(<ActionTrail trail={trailOf(steps, streaming, {})} streaming={streaming} durationMs={4200} />));
  return host;
}

describe("ActionTrail", () => {
  test("while streaming, the list shows what finished and what runs, and only the current action is announced", () => {
    const host = rendered(true, STEPS);
    expect([...host.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["ดูความผิดปกติแล้ว", "กำลังดึงมูลค่าขายเข้า แยกตามภาค · ก.ย. 69"]);
    const live = host.querySelectorAll("[aria-live]");
    expect(live.length).toBe(1);
    expect(live[0].textContent).toBe("กำลังดึงมูลค่าขายเข้า แยกตามภาค · ก.ย. 69");
  });

  test("once finished, one quiet line opens to the list with each action's detail", () => {
    const host = rendered(false, [STEPS[0], { ...STEPS[1], outcome: { state: "returned", result: { ok: true, rows: [] } } } as ReplyStep]);
    expect(host.querySelector("summary")?.textContent).toBe("ใช้ข้อมูล 2 แหล่ง · 4.2 วินาที");
    expect(host.querySelector("details")?.open).toBe(false);
    expect([...host.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["ดูความผิดปกติแล้ว", "ดึงมูลค่าขายเข้าแล้ว · แยกตามภาค · ก.ย. 69"]);
    expect(host.querySelector("[aria-live]")).toBeNull();
  });
});
