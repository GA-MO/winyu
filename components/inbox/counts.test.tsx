import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

const { useInboxCounts } = await import("./counts");

const ORIGINAL_FETCH = globalThis.fetch;
const POLL_INTERVAL_MS = 10_000;
const MICROTASK_ROUNDS = 20;

const mounted: Root[] = [];
let visibility: DocumentVisibilityState = "visible";

Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

function Badge() {
  const { counts } = useInboxCounts();
  return <span>{counts.decisions}</span>;
}

function mountBadge(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => root.render(<Badge />));
  return host;
}

function serveDecisions(read: () => number) {
  const served = mock(async () => Response.json({ decisions: read(), sharedUnread: 0 }));
  globalThis.fetch = served as unknown as typeof fetch;
  return served;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function flushMicrotasks() {
  await act(async () => {
    for (let round = 0; round < MICROTASK_ROUNDS; round += 1) await Promise.resolve();
  });
}

async function advance(ms: number) {
  act(() => jest.advanceTimersByTime(ms));
  await flushMicrotasks();
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}

afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
  jest.useRealTimers();
  visibility = "visible";
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("useInboxCounts", () => {
  test("coming back to the window shows work that arrived while it was in the background", async () => {
    let decisions = 0;
    serveDecisions(() => decisions);
    const host = mountBadge();
    await settle();
    expect(host.textContent).toBe("0");

    decisions = 1;
    act(() => window.dispatchEvent(new Event("focus")));
    await settle();
    expect(host.textContent).toBe("1");
  });

  test("a visible page shows new work within the poll interval with no focus event", async () => {
    jest.useFakeTimers();
    let decisions = 0;
    serveDecisions(() => decisions);
    const host = mountBadge();
    await flushMicrotasks();
    expect(host.textContent).toBe("0");

    decisions = 2;
    await advance(POLL_INTERVAL_MS);
    expect(host.textContent).toBe("2");
  });

  test("a hidden page does not fetch", async () => {
    jest.useFakeTimers();
    const served = serveDecisions(() => 0);
    mountBadge();
    await flushMicrotasks();
    const callsWhenHidden = served.mock.calls.length;

    setVisibility("hidden");
    await advance(POLL_INTERVAL_MS * 3);
    expect(served.mock.calls.length).toBe(callsWhenHidden);
  });

  test("a page that becomes visible again fetches at once and resumes polling", async () => {
    jest.useFakeTimers();
    let decisions = 0;
    const served = serveDecisions(() => decisions);
    const host = mountBadge();
    await flushMicrotasks();
    setVisibility("hidden");

    decisions = 3;
    setVisibility("visible");
    await flushMicrotasks();
    expect(host.textContent).toBe("3");

    const callsAfterReturn = served.mock.calls.length;
    await advance(POLL_INTERVAL_MS);
    expect(served.mock.calls.length).toBe(callsAfterReturn + 1);
  });

  test("an unmounted badge stops polling", async () => {
    jest.useFakeTimers();
    const served = serveDecisions(() => 0);
    mountBadge();
    await flushMicrotasks();
    for (const root of mounted.splice(0)) act(() => root.unmount());
    const callsAtUnmount = served.mock.calls.length;

    await advance(POLL_INTERVAL_MS * 3);
    expect(served.mock.calls.length).toBe(callsAtUnmount);
  });
});
