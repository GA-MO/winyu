import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TH } from "@/lib/i18n/th";
import { BellPopover } from "./bell-popover";
import type { BellPayload } from "./items";

const COPY = TH.notifications;
const AT = new Date().toISOString();
const PAYLOAD: BellPayload = {
  decide: [
    { key: "grant_request:rq1", kind: "grant_request", refId: "rq1", title: "คุณกฤตขอสิทธิ์", person: null, at: AT, read: false, target: "/g/rq1", notificationId: "n-request" },
    { key: "staff_request:sr1", kind: "staff_request", refId: "sr1", title: "คุณกฤตขออนุมัติ: ใบลาพักร้อน", person: null, at: AT, read: false, target: "/?inbox", notificationId: "n-staff" },
  ],
  updates: [{ key: "n-share", kind: "share", refId: "code1", title: "คุณธนาส่งการ์ด", person: null, at: AT, read: false, target: "/s/code1", notificationId: "n-share" }],
};

type Call = { url: string; method: string; body: unknown };

let mounted: { root: Root; host: HTMLElement } | null = null;

function fakeServer(payload: BellPayload) {
  const calls: Call[] = [];
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === "/api/notifications/bell") return Response.json(payload);
    return Response.json({ ok: true });
  }) as typeof fetch);
  return { calls, spy };
}

async function openPopover() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  const seen = { closed: 0, inbox: 0, changed: 0, went: [] as string[] };
  await act(async () =>
    root.render(<BellPopover onClose={() => seen.closed++} onOpenInbox={() => seen.inbox++} onChanged={() => seen.changed++} navigate={(href) => seen.went.push(href)} />),
  );
  return { host, seen };
}

function button(host: HTMLElement, text: string, index = 0): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].filter((candidate) => candidate.textContent === text)[index];
}

afterEach(async () => {
  if (!mounted) return;
  const { root, host } = mounted;
  await act(async () => root.unmount());
  host.remove();
  mounted = null;
});

describe("the bell popover", () => {
  test("opening it only reads the list; no decision or update is marked read", async () => {
    const server = fakeServer(PAYLOAD);
    const { host } = await openPopover();
    server.spy.mockRestore();
    expect(server.calls).toEqual([{ url: "/api/notifications/bell", method: "GET", body: null }]);
    expect(host.textContent).toContain(COPY.decide);
    expect(host.textContent).toContain(COPY.updates);
  });

  test("opening an update reads that one notification, closes the popover and goes to its target", async () => {
    const server = fakeServer(PAYLOAD);
    const { host, seen } = await openPopover();
    const update = host.querySelector<HTMLAnchorElement>('[data-bell-item="n-share"]');
    await act(async () => update?.click());
    server.spy.mockRestore();
    expect(server.calls.slice(1)).toEqual([{ url: "/api/notifications", method: "POST", body: { id: "n-share" } }]);
    expect(seen).toMatchObject({ closed: 1, went: ["/s/code1"] });
  });

  test("พิจารณา on a leave request opens the Inbox where it is decided and reads its notification; nothing is approved from the popover", async () => {
    const server = fakeServer({ ...PAYLOAD, decide: PAYLOAD.decide.filter((item) => item.kind === "staff_request") });
    const { host, seen } = await openPopover();
    await act(async () => button(host, COPY.actions.staff_request)?.click());
    server.spy.mockRestore();
    expect(server.calls.slice(1)).toEqual([{ url: "/api/notifications", method: "POST", body: { id: "n-staff" } }]);
    expect(seen).toMatchObject({ closed: 1, went: ["/?inbox"] });
  });

  test("พิจารณา on a grant request opens its approval page and reads its notification; nothing is approved from the popover", async () => {
    const server = fakeServer(PAYLOAD);
    const { host, seen } = await openPopover();
    await act(async () => button(host, COPY.actions.grant_request)?.click());
    server.spy.mockRestore();
    expect(server.calls.slice(1)).toEqual([{ url: "/api/notifications", method: "POST", body: { id: "n-request" } }]);
    expect(seen).toMatchObject({ closed: 1, went: ["/g/rq1"] });
  });

  test("read all marks everything read in one call; เปิด Inbox closes the popover and opens the drawer", async () => {
    const server = fakeServer(PAYLOAD);
    const { host, seen } = await openPopover();
    await act(async () => button(host, COPY.markAllRead)?.click());
    expect(server.calls.slice(1)).toEqual([{ url: "/api/notifications", method: "POST", body: { all: true } }]);
    expect(button(host, COPY.markAllRead)).toBeUndefined();
    await act(async () => button(host, COPY.openInbox)?.click());
    server.spy.mockRestore();
    expect(seen).toMatchObject({ closed: 1, inbox: 1 });
  });

  test("a matter shows its card title, the ask, who sent it and passed it on, and the presses; รับ presses it in place, reads its notification and refreshes", async () => {
    const matter = { code: "m1", title: "ปริมาณขายเข้า", ask: "ช่วยดูภาคอีสาน", senderName: "คุณธนา", passerName: "คุณอนุชา", at: AT, actions: ["accept" as const, "ask" as const, "pass_on" as const, "not_mine" as const, "done" as const], suggested: { ownerId: null, line: [] }, judges: false, sent: false };
    const payload: BellPayload = { decide: [{ key: "matter:m1", kind: "matter", refId: "m1", title: "t", person: null, at: AT, read: false, target: "/s/m1", notificationId: "n-matter", matter }], updates: [] };
    const server = fakeServer(payload);
    const { host, seen } = await openPopover();
    const row = host.querySelector<HTMLElement>('[data-bell-decision="matter"]');
    expect(row?.textContent).toContain(matter.title);
    expect(row?.textContent).toContain(matter.ask);
    expect(row?.textContent).toContain(TH.matter.from(matter.senderName));
    expect(row?.textContent).toContain(TH.matter.via(matter.passerName));
    for (const kind of ["accept", "ask", "pass_on"] as const) expect(button(host, TH.matter.actions[kind])).toBeDefined();
    expect(button(host, TH.matter.actions.not_mine)).toBeUndefined();
    expect(host.querySelector(`button[aria-label="${TH.inbox.more}"]`)).not.toBeNull();

    await act(async () => button(host, TH.matter.actions.accept)?.click());
    server.spy.mockRestore();
    expect(server.calls.slice(1, 3)).toEqual([
      { url: "/api/matters/m1", method: "POST", body: { kind: "accept" } },
      { url: "/api/notifications", method: "POST", body: { id: "n-matter" } },
    ]);
    expect(server.calls[3]?.url).toBe("/api/notifications/bell");
    expect(seen).toMatchObject({ closed: 0, changed: 1, went: [] });
  });

  test("after รับ the row leaves the decisions but a line says it was accepted and opens the matter, so the bell does not just empty (AI-197)", async () => {
    const matter = { code: "m1", title: "ปริมาณขายเข้า · ภาคอีสาน", ask: "ช่วยดูภาคอีสาน", senderName: "คุณธนา", passerName: "คุณอนุชา", at: AT, actions: ["accept" as const, "ask" as const, "pass_on" as const], suggested: { ownerId: null, line: [] }, judges: false, sent: false };
    const waiting: BellPayload = { decide: [{ key: "matter:m1", kind: "matter", refId: "m1", title: "t", person: null, at: AT, read: false, target: "/s/m1", notificationId: "n-matter", matter }], updates: [] };
    let loads = 0;
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/notifications/bell") return Response.json({ ok: true });
      loads += 1;
      return Response.json(loads === 1 ? waiting : { decide: [], updates: [] });
    }) as typeof fetch);
    const { host, seen } = await openPopover();
    await act(async () => button(host, TH.matter.actions.accept)?.click());
    spy.mockRestore();
    expect(host.querySelector('[data-bell-decision="matter"]')).toBeNull();
    const acted = host.querySelector<HTMLElement>("[data-bell-acted]");
    expect(acted?.textContent).toContain(COPY.acted.accept);
    expect(acted?.textContent).toContain(matter.title);
    await act(async () => acted?.querySelector("a")?.click());
    expect(seen.went).toEqual(["/s/m1"]);
  });

  test("with nothing waiting and nothing new it says so", async () => {
    const server = fakeServer({ decide: [], updates: [] });
    const { host } = await openPopover();
    server.spy.mockRestore();
    expect(host.textContent).toContain(COPY.allCaughtUp);
    expect(button(host, COPY.markAllRead)).toBeUndefined();
  });
});

describe("bell rows on a phone (AI-159)", () => {
  const LONG = "คุณอนุชา พรหมศรี ส่งต่อเรื่อง \"ปริมาณขายเข้า (Sell-in) · รายเอเย่นต์ · ภาคอีสาน\" ให้ คุณกฤต จันทร์เสน";
  const MATTER_TITLE = "ปริมาณขายเข้า (Sell-in) · รายเอเย่นต์ · ภาคอีสาน";

  test("an update and a matter keep the recipient and the card's name readable: their lines wrap, never cut to one line", async () => {
    const brief = { code: "m1", title: MATTER_TITLE, ask: "ช่วยดู", senderName: "คุณธนา", passerName: null, at: AT, actions: [], suggested: { ownerId: null, line: [] }, judges: false, sent: false };
    fakeServer({
      decide: [{ key: "matter:m1", kind: "matter", refId: "m1", title: MATTER_TITLE, person: null, at: AT, read: false, target: "/s/m1", notificationId: "n-matter", matter: brief }],
      updates: [{ key: "n-pass", kind: "matter_update", refId: "m1", title: LONG, person: null, at: AT, read: false, target: "/s/m1", notificationId: "n-pass" }],
    });
    const { host } = await openPopover();
    const holding = (text: string) => [...host.querySelectorAll("a, span")].filter((node) => node.textContent === text);
    expect(holding(LONG).length).toBeGreaterThan(0);
    expect(holding(MATTER_TITLE).length).toBeGreaterThan(0);
    for (const node of [...holding(LONG), ...holding(MATTER_TITLE)]) expect(node.className).not.toMatch(/\btruncate\b|line-clamp-1\b/);
  });
});

describe("an open bell panel (AI-210)", () => {
  test("loads again when the bell's counts change, so a matter that arrives while it is open shows without closing it", async () => {
    const matter = { code: "m2", title: "ปริมาณขายเข้า · ภาคอีสาน", ask: "ช่วยดู", senderName: "คุณธนา", passerName: "คุณอนุชา", at: AT, actions: ["accept" as const], suggested: { ownerId: null, line: [] }, judges: false, sent: false };
    const arrived: BellPayload = { decide: [{ key: "matter:m2", kind: "matter", refId: "m2", title: "t", person: null, at: AT, read: false, target: "/s/m2", notificationId: "n-m2", matter }], updates: [] };
    let current: BellPayload = { decide: [], updates: [] };
    const spy = spyOn(globalThis, "fetch").mockImplementation((async () => Response.json(current)) as unknown as typeof fetch);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted = { root, host };
    const draw = (decisions: number) => root.render(<BellPopover counts={{ decisions, sharedUnread: 0, unreadUpdates: 0 }} onClose={() => undefined} onOpenInbox={() => undefined} onChanged={() => undefined} navigate={() => undefined} />);
    await act(async () => draw(0));
    expect(host.querySelector('[data-bell-decision="matter"]')).toBeNull();
    current = arrived;
    await act(async () => draw(1));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    spy.mockRestore();
    expect(host.querySelector('[data-bell-decision="matter"]')?.textContent).toContain(matter.title);
  });
});
