import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ShareReceipt, ShareTarget } from "@/lib/share/card";

let pathname = "/c/one";
mock.module("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { SENT_SHOWN_MS, ShareProvider, ShareSent, useShareCard } = await import("./share-sheet");

const RECEIPT: ShareReceipt = { userId: "u_anucha", name: "คุณอนุชา พรหมศรี", asked: "winyu", via: "winyu", fallback: null };
const TARGET: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_volume" } }] }, question: null };

const mounted: { root: Root; host: HTMLElement }[] = [];

function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(node));
  return host;
}

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  jest.useRealTimers();
});

describe("the sent confirmation", () => {
  test("closes by itself after a few seconds", () => {
    jest.useFakeTimers();
    const close = mock(() => undefined);
    mount(<ShareSent title="ปริมาณขายเข้า" receipts={[RECEIPT]} grants={[]} days={null} path="/s/abc" close={close} />);
    act(() => jest.advanceTimersByTime(SENT_SHOWN_MS - 1));
    expect(close).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("stays while the person points at it, and closes a few seconds after they leave", () => {
    jest.useFakeTimers();
    const close = mock(() => undefined);
    const host = mount(<ShareSent title="ปริมาณขายเข้า" receipts={[RECEIPT]} grants={[]} days={null} path="/s/abc" close={close} />);
    const panel = host.querySelector("[data-share-sent]");
    act(() => panel?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    act(() => jest.advanceTimersByTime(SENT_SHOWN_MS * 3));
    expect(close).not.toHaveBeenCalled();
    act(() => panel?.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    act(() => jest.advanceTimersByTime(SENT_SHOWN_MS));
    expect(close).toHaveBeenCalledTimes(1);
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
    const host = mount(tree());
    act(() => host.querySelector<HTMLButtonElement>("[data-open]")?.click());
    expect(host.querySelector("[data-share-ask]")).not.toBeNull();
    pathname = "/c/two";
    act(() => mounted[0]?.root.render(tree()));
    expect(host.querySelector("[data-share-ask]")).toBeNull();
    globalThis.fetch = original;
  });
});
