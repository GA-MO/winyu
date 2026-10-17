import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { followTarget, nextScroll, useFollowLatest } from "./follow-latest";

const VIEWPORT = 800;

type Layout = { height: number; tops: Record<string, number> };

let observers: (() => void)[] = [];
const RealResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      observers.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = RealResizeObserver;
});

function Chat({ ids, waiting = [] }: { ids: string[]; waiting?: string[] }) {
  const { scroller, content, onScroll } = useFollowLatest(ids[ids.length - 1] ?? null);
  return (
    <div ref={scroller} onScroll={onScroll} data-scroller>
      <div ref={content}>
        {ids.map((id) => (
          <article key={id} data-exchange={id}>
            {waiting.includes(id) ? <section data-approval-waiting /> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

type Mounted = { scroller: HTMLElement; layout: Layout; show: (ids: string[], waiting?: string[]) => Promise<void>; scrollTo: (top: number) => Promise<void>; grow: (height: number) => Promise<void>; unmount: () => Promise<void> };

const realRect = HTMLElement.prototype.getBoundingClientRect;

function stubScroller(scroller: HTMLElement, layout: Layout): void {
  let top = 0;
  Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (value: number) => (top = value), configurable: true });
  Object.defineProperty(scroller, "scrollHeight", { get: () => layout.height, configurable: true });
  Object.defineProperty(scroller, "clientHeight", { get: () => VIEWPORT, configurable: true });
  scroller.scrollTo = ((options: ScrollToOptions) => {
    top = options.top ?? top;
  }) as typeof scroller.scrollTo;
}

async function mount(layout: Layout): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Chat ids={[]} />));
  const scroller = host.querySelector<HTMLElement>("[data-scroller]") as HTMLElement;
  stubScroller(scroller, layout);
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const id = this.dataset.exchange;
    return { top: id === undefined ? 0 : (layout.tops[id] ?? 0) - scroller.scrollTop } as DOMRect;
  };
  return {
    scroller,
    layout,
    show: async (ids, waiting) => act(async () => root.render(<Chat ids={ids} waiting={waiting} />)),
    scrollTo: async (top) => {
      scroller.scrollTop = top;
      await act(async () => scroller.dispatchEvent(new Event("scroll", { bubbles: true })));
    },
    grow: async (height) => {
      layout.height = height;
      await act(async () => observers.forEach((callback) => callback()));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
      HTMLElement.prototype.getBoundingClientRect = realRect;
    },
  };
}

describe("where the chat rests while following", () => {
  test("is the bottom while the newest exchange fits on screen, and its question once the reply is taller than the screen", () => {
    expect(followTarget({ top: 0, height: 2000, viewport: VIEWPORT }, 1600)).toBe(1200);
    expect(followTarget({ top: 0, height: 4500, viewport: VIEWPORT }, 3000)).toBe(2984);
  });

  test("never scrolls back up toward the question once the reader went past it: from there it rests at the bottom", () => {
    expect(followTarget({ top: 3300, height: 4500, viewport: VIEWPORT }, 3000)).toBe(3700);
    expect(nextScroll({ top: 3300, height: 4500, viewport: VIEWPORT }, 3000, true)).toBe(3700);
    expect(nextScroll({ top: 0, height: 4500, viewport: VIEWPORT }, 3000, false)).toBeNull();
  });
});

describe("the chat as it grows", () => {
  test("follows a reply while it fits, then stops at its question instead of running to the bottom", async () => {
    const chat = await mount({ height: 1500, tops: { a: 64, b: 1200 } });
    await chat.show(["a", "b"]);
    expect(chat.scroller.scrollTop).toBe(700);
    await chat.grow(1700);
    expect(chat.scroller.scrollTop).toBe(900);
    await chat.grow(4500);
    expect(chat.scroller.scrollTop).toBe(1184);
    await chat.unmount();
  });

  test("brings a new exchange's question into view even after the reader had scrolled up", async () => {
    const chat = await mount({ height: 3000, tops: { a: 64, b: 2000 } });
    await chat.show(["a", "b"]);
    await chat.scrollTo(300);
    chat.layout.height = 4500;
    chat.layout.tops.c = 3000;
    await chat.show(["a", "b", "c"]);
    expect(chat.scroller.scrollTop).toBe(2984);
    await chat.unmount();
  });

  test("after the reader went down to an approval at the end of a long reply, the receipt and the answer that follow it come into view", async () => {
    const chat = await mount({ height: 3000, tops: { a: 64, b: 800 } });
    await chat.show(["a", "b"]);
    expect(chat.scroller.scrollTop).toBe(784);
    await chat.scrollTo(2200);
    await chat.grow(2600);
    await chat.grow(3200);
    expect(chat.scroller.scrollTop).toBe(2400);
    await chat.unmount();
  });

  test("a reply taller than the screen that ends in an approval still waiting rests at the bottom, so its buttons clear the composer (AI-256)", async () => {
    const chat = await mount({ height: 1500, tops: { a: 64, b: 1200 } });
    await chat.show(["a", "b"], ["b"]);
    await chat.grow(2600);
    expect(chat.scroller.scrollTop).toBe(1800);
    await chat.unmount();
  });

  test("leaves a reader who scrolled up to earlier content where they are while the reply grows", async () => {
    const chat = await mount({ height: 3000, tops: { a: 64, b: 1800 } });
    await chat.show(["a", "b"]);
    expect(chat.scroller.scrollTop).toBe(1784);
    await chat.scrollTo(400);
    await chat.grow(3600);
    expect(chat.scroller.scrollTop).toBe(400);
    await chat.unmount();
  });
});
