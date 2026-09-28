import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApprovalRequest } from "vexa/react";
import { TH } from "@/lib/i18n/th";
import { renderWinyuApproval } from "./approval-card";

const HANDOFF = {
  toUserId: "u_anucha",
  title: "อุบลศรีสุข เทรดดิ้ง · สิงห์ · ภาคอีสาน",
  ask: "ช่วยตรวจอุบลศรีสุข เทรดดิ้ง แล้วบอกกลับว่าเกิดจากอะไร",
  urgency: "high",
  evidence: [{ metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 10 }],
  alertIds: ["a_1", "a_2"],
};

function request(tool: string, input: unknown, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return { tool, input, state: "approval-requested", approved: null, approve: () => undefined, reject: () => undefined, ...overrides };
}

function render(tool: string, input: unknown, overrides: Partial<ApprovalRequest> = {}): string {
  return renderToStaticMarkup(renderWinyuApproval(request(tool, input, overrides)));
}

describe("the approval card", () => {
  test("a handoff names the person, their role, the ask and what approving does", () => {
    const html = render("create_handoff", HANDOFF);
    expect(html).toContain("คุณอนุชา พรหมศรี");
    expect(html).toContain("ผู้จัดการขายภาค ภาคอีสาน");
    expect(html).toContain(HANDOFF.ask);
    expect(html).toContain(TH.inbox.urgency.high);
    expect(html).toContain(TH.approve.confirmHandoff);
    expect(html).not.toContain("create_handoff");
  });

  test("the evidence behind a handoff is named, not counted in the raw", () => {
    const html = render("create_handoff", HANDOFF);
    expect(html).toContain("ปริมาณขายเข้า (Sell-in)");
    expect(html).toContain(TH.approve.alertCount(2));
  });

  test("an answered decision becomes a receipt with no buttons left", () => {
    const approved = render("create_handoff", HANDOFF, { state: "output-available", approved: true });
    expect(approved).toContain(TH.approve.doneHandoff("คุณอนุชา พรหมศรี"));
    expect(approved).not.toContain(TH.approve.confirmHandoff);

    const rejected = render("create_handoff", HANDOFF, { state: "output-denied", approved: false });
    expect(rejected).toContain(TH.approve.notDone);
  });

  test("an email says it stays in the demo outbox", () => {
    const html = render("send_email", { toUserId: "u_may", subject: "ขอสิทธิ์ดูเงินเดือนเฉลี่ย", body: "ขอสิทธิ์ครับ" });
    expect(html).toContain("ขอสิทธิ์ดูเงินเดือนเฉลี่ย");
    expect(html).toContain(TH.approve.effectEmail("คุณเมย์ กิตติศักดิ์"));
  });

  test("a pin asks about a card, not about evidence", () => {
    const html = render("pin_widget", { title: "ยอดขายสุทธิเทียบเป้า", kind: "bar", query: HANDOFF.evidence[0] });
    expect(html).toContain(TH.approve.card);
    expect(html).not.toContain(TH.approve.attached);
  });

  test("a job is named in Thai", () => {
    const html = render("run_job", { job: "forecast" });
    expect(html).toContain(TH.approve.jobs.forecast);
  });

  test("a tool Winyu has no decision for falls back to Vexa's own card", () => {
    expect(renderWinyuApproval(request("query_metric", {}))).toBeNull();
  });
});
