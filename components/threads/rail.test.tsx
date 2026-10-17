import { afterEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TH } from "@/lib/i18n/th";

mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

const { ThreadRail } = await import("./rail");

const ORIGINAL_FETCH = globalThis.fetch;
const mounted: Root[] = [];

function mountRail(): HTMLElement {
  globalThis.fetch = (async () => Response.json({ threads: [], decisions: 0, sharedUnread: 0, unreadUpdates: 0 })) as unknown as typeof fetch;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => root.render(<ThreadRail />));
  return host;
}

function railOf(host: HTMLElement): HTMLElement {
  const rail = host.querySelector("aside");
  if (!rail) throw new Error("no rail");
  return rail;
}

/** Whether anything on the rail animates at phone width: a transition or a duration with no breakpoint, since a duration alone animates every property (the initial transition-property is all). */
function slides(rail: HTMLElement): boolean {
  return rail.className.split(" ").some((name) => name.startsWith("transition") || name.startsWith("duration-"));
}

afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("the rail on a phone (AI-309)", () => {
  test("never slides into view by itself: before the person opens it nothing animates its position, so a resize or a late style cannot leave it half open over the chat", () => {
    const rail = railOf(mountRail());
    expect(rail.className).toContain("-translate-x-full");
    expect(slides(rail)).toBe(false);
  });

  test("slides in once the person opens it", () => {
    const host = mountRail();
    const open = [...host.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === TH.conversation.rail.expand && button.className.includes("md:hidden"));
    if (!open) throw new Error("no menu button");
    act(() => open.click());
    const rail = railOf(host);
    expect(rail.className).toContain("translate-x-0");
    expect(slides(rail)).toBe(true);
  });
});
