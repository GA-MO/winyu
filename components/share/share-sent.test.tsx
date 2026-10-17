import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { cardRefOf, type ShareContact, type ShareReceipt, type ShareTarget } from "@/lib/share/card";

let pathname = "/c/one";
mock.module("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { ShareChrome, ShareProvider, useShareCard } = await import("./share-sheet");
const { Card } = await import("@/components/ui/primitives");

const RECEIPT: ShareReceipt = { userId: "u_anucha", name: "คุณอนุชา พรหมศรี", asked: "winyu", via: "winyu", fallback: null };
const TARGET: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_volume" } }] }, question: null };

const mounted: { root: Root; host: HTMLElement }[] = [];

function mount(node: React.ReactNode): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(node));
  return { host, root };
}

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

function contact(userId: string): ShareContact {
  const user = findUser(userId);
  if (!user) throw new Error(`no ${userId}`);
  return { id: user.id, nameTh: user.nameTh, title: user.title, role: user.role, region: user.region, photo: null, name: user.name, channels: [{ channel: "email", ready: true }] };
}

function fakeServer() {
  return spyOn(globalThis, "fetch").mockImplementation((async (url: string, init?: RequestInit) => {
    if (url.endsWith("/contacts")) return Response.json({ contacts: [contact("u_anucha")], mayGrant: false });
    if (url.endsWith("/preview")) return Response.json({ ownerId: "u_anucha", line: [], title: "ปริมาณขายเข้า", figures: null, goal: null });
    if (url.endsWith("/scopes")) return Response.json({ scopes: [] });
    if (url.endsWith("/api/shares") && init?.method === "POST") return Response.json({ receipts: [RECEIPT], grants: [], hidden: [], path: "/s/abc" });
    return Response.json({});
  }) as unknown as typeof fetch);
}

async function settle() {
  for (let tick = 0; tick < 5; tick += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

function pillOf(host: HTMLElement): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>("button[aria-label^='ส่งต่อการ์ด']");
}

describe("after a card is sent (AI-197)", () => {
  test("its ส่งต่อ reads as sent, and the receipt sits under the card instead of floating over the page", async () => {
    const spy = fakeServer();
    const { host } = mount(
      <ShareProvider open>
        <ShareChrome target={TARGET}>
          <Card props={{ title: "ปริมาณขายเข้า", footnote: "1–26 พ.ย." }} />
        </ShareChrome>
        <button type="button" data-below>ถามต่อ</button>
      </ShareProvider>,
    );
    await act(async () => pillOf(host)?.click());
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>("[data-share-send]")?.click());
    await settle();
    spy.mockRestore();
    expect(host.querySelector("[data-share-sheet]")).toBeNull();
    expect(pillOf(host)?.textContent).toContain(TH.share.sentButton);
    const receipt = host.querySelector("section [data-share-sent]");
    expect(receipt).not.toBeNull();
    expect(receipt?.className ?? "").not.toContain("fixed");
    expect(receipt?.textContent).toContain(RECEIPT.name);
    expect(document.querySelectorAll("[data-share-sent]")).toHaveLength(1);
  });
});

describe("a card the person already sent (AI-209)", () => {
  test("reads as sent with its receipt when the page is drawn again, from what the server says they sent, not from memory", async () => {
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (url: string, init?: RequestInit) => {
      if (url === "/api/shares" && (init?.method ?? "GET") === "GET") return Response.json({ sent: [{ ref: cardRefOf(TARGET.card), path: "/s/abc", receipts: [RECEIPT] }] });
      return Response.json({});
    }) as unknown as typeof fetch);
    const { host } = mount(
      <ShareProvider open>
        <ShareChrome target={TARGET}>
          <Card props={{ title: "ปริมาณขายเข้า", footnote: "1–26 พ.ย." }} />
        </ShareChrome>
      </ShareProvider>,
    );
    await settle();
    spy.mockRestore();
    expect(pillOf(host)?.textContent).toContain(TH.share.sentButton);
    expect(host.querySelector("[data-share-sent]")?.textContent).toContain(RECEIPT.name);
  });
});

describe("the share sheet", () => {
  test("closes when the person moves to another page", () => {
    const fetchSpy = mock(async () => Response.json({ contacts: [], mayGrant: false, userId: null }));
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    function Opener() {
      const share = useShareCard();
      return <button type="button" data-open onClick={() => share?.(TARGET)}>open</button>;
    }
    const tree = () => (
      <ShareProvider open>
        <Opener />
      </ShareProvider>
    );
    const { host, root } = mount(tree());
    act(() => host.querySelector<HTMLButtonElement>("[data-open]")?.click());
    expect(host.querySelector("[data-share-ask]")).not.toBeNull();
    pathname = "/c/two";
    act(() => root.render(tree()));
    expect(host.querySelector("[data-share-ask]")).toBeNull();
    globalThis.fetch = original;
  });
});
