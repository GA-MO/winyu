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
    if (url.endsWith("/contacts")) return Response.json({ contacts: [contactOf("u_anucha"), contactOf("u_krit"), contactOf("u_saranya")], mayGrant: false });
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

  test("the send approval names its recipient in full beside the deadline, and its ส่ง reads apart from the composer's (AI-252, AI-256)", async () => {
    const name = findUser("u_saranya")?.nameTh ?? "missing";
    const host = await drawnSend({ to: ["u_saranya"], urgency: "today" }, { onScreen: ONE_CARD, question: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคใต้ ขอภายในศุกร์นี้" });
    const heading = host.querySelector("h3");
    expect(heading?.textContent).toBe(TH.approve.sendDone(name));
    expect(heading?.className.split(" ")).not.toContain("truncate");
    const confirm = [...host.querySelectorAll("button")].find((button) => button.textContent === TH.approve.confirmSend);
    expect(confirm?.getAttribute("aria-label")).toBe(TH.approve.sendDone(name));
    expect(TH.chat.send).toBe("ส่งข้อความ");
    expect(host.querySelector("[data-approval-waiting]")).not.toBeNull();
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

  test("a send about one row of the card shows that row's figure, the ask naming it, and what the person claimed about it, from the server's preview of their words (AI-167, AI-168, AI-198)", async () => {
    const focus = { labels: ["ภาคอีสาน"], hero: "ภาคอีสาน 120.4 ล้านบาท +17.6% เทียบช่วงก่อนหน้า", claim: "ข้อความบอกว่าภาคอีสานลดลง แต่การ์ดแสดง ภาคอีสาน +17.6% เทียบช่วงก่อนหน้า" };
    const preview = { ...NO_PREVIEW, title: "มูลค่าขายเข้า · รายภาค · ภาคอีสาน", focus, subject: null };
    const asked: string[] = [];
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string, init?: RequestInit) => {
      if (url.endsWith("/contacts")) return Response.json({ contacts: [contactOf("u_anucha")], mayGrant: false });
      if (url.endsWith("/preview")) {
        asked.push(String(init?.body ?? ""));
        return Response.json(preview);
      }
      return Response.json({ scopes: [] });
    }) as unknown as typeof fetch);
    const claim = "ภาคอีสานลดลงเยอะ ฝากพี่อนุชาตามเจ้านี้";
    const screen = { ...TWO_CARDS, said: ["ส่งไปเลย", claim] };
    const host = document.createElement("div");
    await act(async () => createRoot(host).render(renderApproval(request("send_card", { to: ["u_anucha"], cardRef: onScreen(BY_REGION).ref, ask: "ช่วยตามเจ้านี้" }, { onScreen: screen, question: "ส่งไปเลย" }))));
    for (let tick = 0; tick < 4; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    spy.mockRestore();
    expect(asked.some((body) => body.includes(claim) && body.includes("ช่วยตามเจ้านี้"))).toBe(true);
    expect(host.querySelector("[data-send-card-hero]")?.textContent).toBe(focus.hero);
    expect(host.querySelector("[data-send-card-title]")?.textContent).toBe(preview.title);
    expect(host.textContent).toContain("ช่วยตามเจ้านี้ (ภาคอีสาน)");
    expect(host.querySelector("[data-send-warning]")?.textContent).toBe(focus.claim);
  });

  test("once the conversation pointed out an earlier claim and the ask was rewritten, the sheet drops the warning; the row's change shows with a minus sign in its colour (AI-220)", async () => {
    const row = { label: "ขอนแก่นมหาชัย", change: -1.6, versus: "เทียบเป้าตามเวลา" };
    const figure = { label: "ขอนแก่นมหาชัย", value: "71.0", unit: "ล้านบาท", delta: "-1.6%", trend: "down", tone: "bad", detail: "เทียบเป้าตามเวลา" };
    const focus = { labels: ["ขอนแก่นมหาชัย"], hero: "ขอนแก่นมหาชัย 71.0 ล้านบาท −1.6% เทียบเป้าตามเวลา", figure, row, claim: "ข้อความบอกว่าขอนแก่นมหาชัยตกหนัก แต่การ์ดแสดง ขอนแก่นมหาชัย −1.6% เทียบเป้าตามเวลา" };
    const preview = { ...NO_PREVIEW, title: "มูลค่าขายเข้า · ภาคอีสาน · ขอนแก่นมหาชัย", focus, subject: null };
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string) => {
      if (url.endsWith("/contacts")) return Response.json({ contacts: [contactOf("u_krit")], mayGrant: false });
      if (url.endsWith("/preview")) return Response.json(preview);
      return Response.json({ scopes: [] });
    }) as unknown as typeof fetch);
    const screen = { ...TWO_CARDS, warned: true, said: ["ได้ครับ ส่งตามนั้นเลย", "ขอนแก่นมหาชัยตกหนัก ฝากคุณกฤตเข้าไปคุย"] };
    const host = document.createElement("div");
    await act(async () => createRoot(host).render(renderApproval(request("send_card", { to: ["u_krit"], cardRef: onScreen(BY_REGION).ref, ask: "ฝากคุณกฤตเข้าไปพูดคุยและติดตามยอดขาย" }, { onScreen: screen, question: "ได้ครับ ส่งตามนั้นเลย" }))));
    for (let tick = 0; tick < 4; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    spy.mockRestore();
    expect(host.querySelector("[data-send-warning]")).toBeNull();
    const delta = host.querySelector("[data-send-card-delta]");
    expect(delta?.textContent).toBe("−1.6%");
    expect(delta?.className ?? "").toContain("text-danger");
  });

  test("a row the card prints on the month base shows its share of the month target in its tone with the pace mark under it, and no change on the pace base (AI-235)", async () => {
    const figure = { label: "ขอนแก่นมหาชัย", value: "85.3%", unit: "ของเป้าทั้งเดือน", delta: null, trend: "down", tone: "bad", detail: "ถึงวันนี้ควรได้ 86.7%" };
    const focus = { labels: ["ขอนแก่นมหาชัย"], hero: "ขอนแก่นมหาชัย 85.3% ของเป้าทั้งเดือน ถึงวันนี้ควรได้ 86.7%", figure, row: null, claim: null };
    const preview = { ...NO_PREVIEW, title: "มูลค่าขายเข้า · รายเอเย่นต์ · ภาคอีสาน · ขอนแก่นมหาชัย", focus, subject: null };
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string) => {
      if (url.endsWith("/contacts")) return Response.json({ contacts: [contactOf("u_krit")], mayGrant: false });
      if (url.endsWith("/preview")) return Response.json(preview);
      return Response.json({ scopes: [] });
    }) as unknown as typeof fetch);
    const host = document.createElement("div");
    await act(async () => createRoot(host).render(renderApproval(request("send_card", { to: ["u_krit"], cardRef: onScreen(BY_REGION).ref, ask: "ฝากเข้าไปติดตามสถานการณ์และพูดคุยกับขอนแก่นมหาชัย" }, { onScreen: TWO_CARDS, question: "ได้ครับ ส่งตามนั้นเลย" }))));
    for (let tick = 0; tick < 4; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    spy.mockRestore();
    const value = host.querySelector("[data-send-card-value]");
    expect(value?.textContent).toBe("85.3%");
    expect(value?.className ?? "").toContain("text-danger");
    expect(host.querySelector("[data-send-card-delta]")).toBeNull();
    expect(host.querySelector("[data-send-card-hero]")?.textContent).toBe("85.3%ของเป้าทั้งเดือนขอนแก่นมหาชัย · ถึงวันนี้ควรได้ 86.7%");
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

  test("a pin shows the figure the widget will show, from the server, worked out with the question that drew the card it pins (AI-184)", async () => {
    const asked: string[] = [];
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string, init?: RequestInit) => {
      asked.push(`${url} ${String(init?.body ?? "")}`);
      return url.endsWith("/api/pins/preview") ? Response.json({ hero: "72.6% ของเป้าทั้งเดือน" }) : Response.json({});
    }) as unknown as typeof fetch);
    const host = document.createElement("div");
    const screen = screenWith([CARD_TO_SEND]);
    await act(async () => createRoot(host).render(renderApproval(request("pin_widget", { title: "ยอดขายสุทธิเทียบเป้า", kind: "bar", query: NORTHEAST }, { onScreen: screen, question: "ปักการ์ดนี้ไว้" }))));
    for (let tick = 0; tick < 4; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    spy.mockRestore();
    expect(host.querySelector("[data-pin-hero]")?.textContent).toBe("72.6% ของเป้าทั้งเดือน");
    expect(asked.some((line) => line.includes("/api/pins/preview") && line.includes(CARD_TO_SEND.question ?? "∅"))).toBe(true);
  });

  test("a pin says which pinned card it replaces before the yes, and after it (AI-215)", async () => {
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string) => (url.endsWith("/api/pins/preview") ? Response.json({ hero: "96.3% ของเป้าทั้งเดือน", replaces: ["ยอดขายทั้งประเทศเทียบเป้า"] }) : Response.json({}))) as unknown as typeof fetch);
    const host = document.createElement("div");
    const root = createRoot(host);
    const input = { title: "ปิดเดือนทั้งประเทศ", kind: "month_end", query: NORTHEAST };
    await act(async () => root.render(renderApproval(request("pin_widget", input, { question: "ปักไว้" }))));
    for (let tick = 0; tick < 4; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(host.querySelector("[data-pin-replaces]")?.textContent).toContain("ยอดขายทั้งประเทศเทียบเป้า");
    await act(async () => root.render(renderApproval({ ...request("pin_widget", input, { question: "ปักไว้" }), approved: true })));
    spy.mockRestore();
    expect(host.textContent).toContain("ยอดขายทั้งประเทศเทียบเป้า");
  });

  test("a pin receipt drawn again from the transcript names the card the pin replaced, from the tool's result (AI-246)", () => {
    const input = { title: "คาดการณ์ยอดขายปิดสิ้นเดือนเทียบเป้าหมาย", kind: "month_end", query: NORTHEAST };
    const result = { ok: true, summary: "", data: { widgetId: "w1", position: 0, replaced: ["ยอดขายทั้งประเทศเทียบเป้า"] } };
    const host = document.createElement("div");
    host.innerHTML = render("pin_widget", input, { approved: true, result });
    expect(host.textContent).toContain(TH.approve.donePinInstead(["ยอดขายทั้งประเทศเทียบเป้า"]));
  });

  test("the replacement warning calls the two cards the same subject, not the same number (AI-246)", () => {
    expect(TH.approve.pinReplaces(["ยอดขายทั้งประเทศเทียบเป้า"])).toContain("เรื่องเดียวกัน");
    expect(TH.approve.pinReplaces(["ยอดขายทั้งประเทศเทียบเป้า"])).not.toContain("ตัวเลขเดียวกัน");
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
