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
    { key: "handoff:pk1", kind: "handoff", refId: "pk1", title: "งานใหม่จากคุณอนุชา", person: null, at: AT, read: false, target: "/c/new?preload=pk1", notificationId: "n-handoff" },
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

  test("รับงาน on a handoff accepts its packet, reads its notification and refreshes the badge without leaving", async () => {
    const server = fakeServer(PAYLOAD);
    const { host, seen } = await openPopover();
    await act(async () => button(host, COPY.actions.handoff)?.click());
    server.spy.mockRestore();
    expect(server.calls.slice(1, 3)).toEqual([
      { url: "/api/inbox/pk1", method: "POST", body: { action: "accept" } },
      { url: "/api/notifications", method: "POST", body: { id: "n-handoff" } },
    ]);
    expect(server.calls[3]?.url).toBe("/api/notifications/bell");
    expect(seen).toMatchObject({ closed: 0, changed: 1, went: [] });
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

  test("with nothing waiting and nothing new it says so", async () => {
    const server = fakeServer({ decide: [], updates: [] });
    const { host } = await openPopover();
    server.spy.mockRestore();
    expect(host.textContent).toContain(COPY.allCaughtUp);
    expect(button(host, COPY.markAllRead)).toBeUndefined();
  });
});
