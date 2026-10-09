import { describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { ChannelOption, ShareContact } from "@/lib/share/card";
import { renderApproval, type ApprovalRequest } from "./approval-card";

const HANDOFF = {
  toUserId: "u_anucha",
  title: "อุบลศรีสุข เทรดดิ้ง · สิงห์ · ภาคอีสาน",
  ask: "ช่วยตรวจอุบลศรีสุข เทรดดิ้ง แล้วบอกกลับว่าเกิดจากอะไร",
  urgency: "high",
  evidence: [{ metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 10 }],
  alertIds: ["a_1", "a_2"],
};

function request(tool: string, input: unknown, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return { tool, input, approved: null, approve: () => undefined, reject: () => undefined, ...overrides };
}

function render(tool: string, input: unknown, overrides: Partial<ApprovalRequest> = {}): string {
  return renderToStaticMarkup(renderApproval(request(tool, input, overrides)));
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
    const approved = render("create_handoff", HANDOFF, { approved: true });
    expect(approved).toContain(TH.approve.doneHandoff("คุณอนุชา พรหมศรี"));
    expect(approved).not.toContain(TH.approve.confirmHandoff);

    const rejected = render("create_handoff", HANDOFF, { approved: false });
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

  test("a sent email points to the demo Outbox; a pending or declined one does not", () => {
    const input = { toUserId: "u_may", subject: "ขอสิทธิ์", body: "ขอสิทธิ์ครับ" };
    const sent = render("send_email", input, { approved: true });
    expect(sent).toContain('href="/outbox"');
    expect(sent).toContain(TH.outbox.viewLink);
    expect(sent).toContain(TH.outbox.demoNote);
    expect(render("send_email", input)).not.toContain(TH.outbox.viewLink);
    expect(render("send_email", input, { approved: false })).not.toContain(TH.outbox.viewLink);
  });

  test("a sent share points to the Outbox only when a recipient was reached by email", async () => {
    const krit = findUser("u_krit");
    if (!krit) throw new Error("u_krit missing");
    const contact = (channels: ChannelOption[]): ShareContact => ({ id: krit.id, nameTh: krit.nameTh, title: krit.title, role: krit.role, region: krit.region, photo: null, name: krit.name, channels });
    const drawn = async (channels: ChannelOption[], channel: string) => {
      const contacts = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ contacts: [contact(channels)], mayGrant: false }));
      const host = document.createElement("div");
      await act(async () => createRoot(host).render(renderApproval(request("share_card", { to: [krit.nameTh], channel }, { approved: true, shareTitle: "มูลค่าขายเข้า" }))));
      contacts.mockRestore();
      return host.innerHTML;
    };
    const teamsNotReady = await drawn([{ channel: "email", ready: true }, { channel: "teams", ready: false }], "teams");
    expect(teamsNotReady).toContain('href="/outbox"');
    const line = await drawn([{ channel: "email", ready: true }, { channel: "line", ready: true }], "line");
    expect(line).toContain(TH.approve.doneShare(krit.nameTh));
    expect(line).not.toContain(TH.outbox.viewLink);
  });

  test("a tool that needs no approval draws no decision", () => {
    expect(renderApproval(request("query_metric", {}))).toBeNull();
  });
});
