import { describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { SendPreview, ShareContact, ShareTarget } from "@/lib/share/card";
import { addDays, businessToday } from "@/lib/data/dates";
import { formatDateTh } from "@/lib/i18n/format";
import { onScreen, screenWith } from "@/scripts/screen-cards";
import { renderApproval, type ApprovalRequest } from "./approval-card";

const NORTHEAST = { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: 10 };
const CARD_TO_SEND: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: NORTHEAST }] }, question: "ยอดขายเข้าภาคอีสานเดือนนี้เทียบเป้า" };
const ON_TARGET_CLAIM = "บอกว่าเดือนนี้ผมจะปิดเกินเป้าแน่นอน";
const NO_PREVIEW: SendPreview = { ownerId: null, line: [], title: null, figures: null, goal: null };
const ONE_CARD = screenWith([CARD_TO_SEND]);
const BY_REGION: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value", dims: ["region"], filters: {} } }] }, question: "ยอดขายแยกตามภาค" };
const TWO_CARDS = screenWith([onScreen(CARD_TO_SEND, "earlier-exchange", "3.9 ล้านลิตร"), onScreen(BY_REGION, "earlier-exchange", "฿412.5M")]);

function contactOf(userId: string): ShareContact {
  const user = findUser(userId);
  if (!user) throw new Error(`${userId} missing`);
  return { id: user.id, nameTh: user.nameTh, title: user.title, role: user.role, region: user.region, photo: null, name: user.name, channels: [{ channel: "email", ready: true }] };
}

function offersSend(host: HTMLElement): boolean {
  return [...host.querySelectorAll("button")].some((button) => button.textContent === TH.approve.confirmSend);
}

async function drawnSend(input: unknown, overrides: Partial<ApprovalRequest>, preview: SendPreview = NO_PREVIEW): Promise<HTMLElement> {
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string) => {
    if (url.endsWith("/contacts")) return Response.json({ contacts: [contactOf("u_anucha"), contactOf("u_krit")], mayGrant: false });
    if (url.endsWith("/preview")) return Response.json(preview);
    return Response.json({ scopes: [] });
  }) as unknown as typeof fetch);
  const host = document.createElement("div");
  await act(async () => createRoot(host).render(renderApproval(request("send_card", input, overrides))));
  for (let tick = 0; tick < 4; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  spy.mockRestore();
  return host;
}

function request(tool: string, input: unknown, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return { tool, input, approved: null, approve: () => undefined, reject: () => undefined, ...overrides };
}

function render(tool: string, input: unknown, overrides: Partial<ApprovalRequest> = {}): string {
  return renderToStaticMarkup(renderApproval(request(tool, input, overrides)));
}

describe("the approval card", () => {
  test("a send with no recipient named is the send sheet filled in: the card's owner, the card, the ask, and the urgency the person's words gave", async () => {
    const host = await drawnSend({ ask: "ช่วยดูอีสานหน่อย" }, { onScreen: ONE_CARD, question: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน" }, { ...NO_PREVIEW, ownerId: "u_anucha" });
    expect(host.querySelector("[data-send-recipient]")?.getAttribute("data-send-recipient")).toBe("u_anucha");
    expect(host.textContent).toContain(TH.share.suggested);
    expect(host.textContent).toContain("ปริมาณขายเข้า");
    expect(host.textContent).toContain("ช่วยดูอีสานหน่อย");
    expect(host.textContent).toContain(TH.share.urgency.now);
    expect(host.querySelector("[data-send-intent]")?.getAttribute("data-send-intent")).toBe("act");
    expect(offersSend(host)).toBe(true);
    expect(host.textContent).not.toContain("send_card");
  });

  test("the model's 'now' without the person saying urgent goes out as today", async () => {
    const host = await drawnSend({ to: ["u_anucha"], urgency: "now" }, { onScreen: ONE_CARD, question: "ฝากผู้จัดการขายภาคอีสานดูหน่อย" });
    expect(host.textContent).toContain(TH.share.urgency.today);
    expect(host.textContent).not.toContain(TH.share.urgency.now);
  });

  test("an ask that claims the card is over target while it shows 87.9% carries one warning line from code, and can still be sent", async () => {
    const preview = { ...NO_PREVIEW, ownerId: "u_anucha", figures: { attainment: 87.9, change: null } };
    const host = await drawnSend({ to: ["พี่อนุชา"], ask: ON_TARGET_CLAIM }, { onScreen: ONE_CARD, question: ON_TARGET_CLAIM }, preview);
    expect(host.querySelector("[data-send-warning]")?.textContent).toBe(TH.share.contradicts.atTarget("87.9%"));
    expect(host.querySelector("[data-send-recipient]")?.getAttribute("data-send-recipient")).toBe("u_anucha");
    expect(offersSend(host)).toBe(true);
  });

  test("an ask the card agrees with carries no warning", async () => {
    const preview = { ...NO_PREVIEW, figures: { attainment: 87.9, change: null } };
    const host = await drawnSend({ to: ["u_anucha"], ask: "เดือนนี้ไม่ถึงเป้า ช่วยดูหน่อย" }, { onScreen: ONE_CARD }, preview);
    expect(host.querySelector("[data-send-warning]")).toBeNull();
  });

  test("with no card in the conversation the sheet says so and offers no ส่ง", async () => {
    const host = await drawnSend({ to: ["u_anucha"] }, { onScreen: screenWith([]) });
    expect(host.textContent).toContain(TH.approve.sendNoCard);
    expect(offersSend(host)).toBe(false);
  });

  test("the sheet shows the exact card that goes: the one the call names by ref, with its title and headline figure", async () => {
    const host = await drawnSend({ to: ["u_anucha"], cardRef: onScreen(BY_REGION).ref }, { onScreen: TWO_CARDS });
    expect(host.querySelector("[data-send-card-title]")?.textContent).toBe("มูลค่าขายเข้า · รายภาค");
    expect(host.querySelector("[data-send-card-hero]")?.textContent).toBe("฿412.5M");
    expect(offersSend(host)).toBe(true);
  });

  test("with two cards on screen and none named, the sheet says it does not know which and offers no ส่ง", async () => {
    const host = await drawnSend({ to: ["u_anucha"] }, { onScreen: TWO_CARDS });
    expect(host.querySelector("[data-send-card]")).toBeNull();
    expect(host.textContent).toContain(TH.approve.sendUnclearCard);
    expect(offersSend(host)).toBe(false);
  });

  test("a deadline the sender wrote shows as the day it is due", async () => {
    const host = await drawnSend({ to: ["u_anucha"] }, { onScreen: ONE_CARD, question: "โทรตามหนี้ภายในพรุ่งนี้แล้วตอบกลับมา" });
    expect(host.querySelector("[data-send-urgency]")?.textContent).toBe(TH.share.dueBy(formatDateTh(addDays(businessToday(), 1))));
  });

  test("an answered send becomes a receipt with no buttons left", async () => {
    const approved = await drawnSend({ to: ["u_anucha"] }, { approved: true, onScreen: ONE_CARD });
    expect(approved.textContent).toContain(TH.approve.doneSend("คุณอนุชา พรหมศรี"));
    expect(offersSend(approved)).toBe(false);
    const rejected = await drawnSend({ to: ["u_anucha"] }, { approved: false, onScreen: ONE_CARD });
    expect(rejected.textContent).toContain(TH.approve.notDone);
  });

  test("an email says it stays in the demo outbox", () => {
    const html = render("send_email", { toUserId: "u_may", subject: "ขอสิทธิ์ดูเงินเดือนเฉลี่ย", body: "ขอสิทธิ์ครับ" });
    expect(html).toContain("ขอสิทธิ์ดูเงินเดือนเฉลี่ย");
    expect(html).toContain(TH.approve.effectEmail("คุณเมย์ กิตติศักดิ์"));
  });

  test("a pin asks about a card, not about evidence", () => {
    const html = render("pin_widget", { title: "ยอดขายสุทธิเทียบเป้า", kind: "bar", query: NORTHEAST });
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

  test("a tool that needs no approval draws no decision", () => {
    expect(renderApproval(request("query_metric", {}))).toBeNull();
  });
});

describe("a permission change", () => {
  const FIELD = { role: "sales_rep", kind: "field", key: "crm.order_value", value: "none" };

  test("never shows the field, tool or metric id, not even before its Thai name arrives or when it does not", () => {
    for (const input of [FIELD, { ...FIELD, kind: "tool", key: "store_visits", value: "deny" }, { ...FIELD, kind: "metric", key: "avg_salary", value: "masked" }]) {
      for (const approved of [null, false]) {
        const html = render("set_permission", input, { approved });
        expect(html).not.toContain(input.key);
        expect(html).not.toContain(input.role);
      }
    }
    expect(render("set_permission", { ...FIELD, kind: "metric", key: "avg_salary" })).toContain("เงินเดือนเฉลี่ย");
  });

  test("names a native tool from the first draw, without waiting on a lookup that may never answer", () => {
    const html = render("set_permission", { ...FIELD, kind: "tool", key: "store_visits", value: "deny" });
    expect(html).toContain(TH.admin.tools.store_visits.label);
    expect(html).not.toContain(`${TH.approve.permissionKind.tool} →`);
  });

  test("names the field in Thai once the label comes back", async () => {
    const spy = spyOn(globalThis, "fetch").mockImplementation((async () => Response.json({ label: "ยอดสั่งซื้อจากการเยี่ยมร้าน" })) as unknown as typeof fetch);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(renderApproval(request("set_permission", FIELD))));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(host.textContent).toContain("ยอดสั่งซื้อจากการเยี่ยมร้าน");
    expect(host.textContent).not.toContain("crm.order_value");
    await act(async () => root.unmount());
    host.remove();
    spy.mockRestore();
  });
});
