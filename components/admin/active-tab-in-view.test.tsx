import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ActiveTabInView, overflowEdge } from "./active-tab-in-view";

const BAR_WIDTH = 360;
const TAB_WIDTH = 120;
const TABS = ["overview", "access", "tools", "audit", "connections"];
const mounted: Root[] = [];

function Bar({ current }: { current: string }) {
  return (
    <div data-testid="bar">
      {TABS.map((tab) => (
        <a key={tab} data-tab={tab} aria-current={tab === current ? "page" : undefined}>
          {tab}
        </a>
      ))}
      <ActiveTabInView current={current} />
    </div>
  );
}

function laidOut(bar: HTMLElement) {
  Object.defineProperty(bar, "clientWidth", { configurable: true, get: () => BAR_WIDTH });
  Object.defineProperty(bar, "scrollWidth", { configurable: true, get: () => TAB_WIDTH * TABS.length });
  bar.getBoundingClientRect = () => ({ left: 0, width: BAR_WIDTH }) as DOMRect;
  for (const tab of bar.querySelectorAll<HTMLElement>("[data-tab]")) {
    const index = TABS.indexOf(tab.dataset.tab ?? "");
    tab.getBoundingClientRect = () => ({ left: index * TAB_WIDTH - bar.scrollLeft, width: TAB_WIDTH }) as DOMRect;
  }
}

afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
});

describe("the admin tab bar keeps the current tab in view at phone width (AI-196)", () => {
  test("moving to another tab scrolls the bar to it, not only the first render", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted.push(root);
    act(() => root.render(<Bar current="overview" />));
    const bar = host.querySelector<HTMLElement>("[data-testid=bar]");
    if (!bar) throw new Error("bar");
    laidOut(bar);

    act(() => root.render(<Bar current="audit" />));
    const audit = bar.querySelector<HTMLElement>("[data-tab=audit]")?.getBoundingClientRect();
    expect(audit && audit.left >= 0 && audit.left + audit.width <= BAR_WIDTH).toBe(true);
  });

  test("the bar says which side has more tabs, so a cut tab reads as scrollable", () => {
    expect(overflowEdge({ scrollLeft: 0, scrollWidth: 600, clientWidth: 360 })).toBe("right");
    expect(overflowEdge({ scrollLeft: 120, scrollWidth: 600, clientWidth: 360 })).toBe("both");
    expect(overflowEdge({ scrollLeft: 240, scrollWidth: 600, clientWidth: 360 })).toBe("left");
    expect(overflowEdge({ scrollLeft: 0, scrollWidth: 360, clientWidth: 360 })).toBe("none");
  });
});
