import { afterEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";

mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

const { useInboxCounts } = await import("./counts");

const ORIGINAL_FETCH = globalThis.fetch;

function Badge() {
  const { counts } = useInboxCounts();
  return <span>{counts.decisions}</span>;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("useInboxCounts", () => {
  test("coming back to the window shows work that arrived while it was in the background", async () => {
    let decisions = 0;
    globalThis.fetch = mock(async () => Response.json({ decisions, sharedUnread: 0 })) as unknown as typeof fetch;
    const host = document.createElement("div");
    document.body.append(host);
    act(() => createRoot(host).render(<Badge />));
    await settle();
    expect(host.textContent).toBe("0");

    decisions = 1;
    act(() => window.dispatchEvent(new Event("focus")));
    await settle();
    expect(host.textContent).toBe("1");
  });
});
