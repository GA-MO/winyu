import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const refresh = mock(() => {});
mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh }), usePathname: () => "/admin" }));

const { AuditRefresh } = await import("./audit-refresh");

const POLL_INTERVAL_MS = 10_000;
const mounted: Root[] = [];
let visibility: DocumentVisibilityState = "visible";

Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

function mountPanel() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => root.render(<AuditRefresh />));
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}

afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
  jest.useRealTimers();
  visibility = "visible";
  refresh.mockClear();
});

describe("the Audit activity panel refreshes like the bell (AI-196)", () => {
  test("coming back to the window reads the activity again", () => {
    mountPanel();
    const before = refresh.mock.calls.length;
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refresh.mock.calls.length).toBe(before + 1);
  });

  test("a visible page reads the activity again every poll interval, a hidden one does not", () => {
    jest.useFakeTimers();
    mountPanel();
    const before = refresh.mock.calls.length;
    act(() => jest.advanceTimersByTime(POLL_INTERVAL_MS));
    expect(refresh.mock.calls.length).toBe(before + 1);

    setVisibility("hidden");
    const hidden = refresh.mock.calls.length;
    act(() => jest.advanceTimersByTime(POLL_INTERVAL_MS * 3));
    expect(refresh.mock.calls.length).toBe(hidden);
  });

  test("an unmounted panel stops reading", () => {
    jest.useFakeTimers();
    mountPanel();
    for (const root of mounted.splice(0)) act(() => root.unmount());
    const atUnmount = refresh.mock.calls.length;
    act(() => jest.advanceTimersByTime(POLL_INTERVAL_MS * 3));
    expect(refresh.mock.calls.length).toBe(atUnmount);
  });
});
