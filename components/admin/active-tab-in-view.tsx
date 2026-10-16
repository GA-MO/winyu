"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const ACTIVE_TAB = '[aria-current="page"]';
const EDGE_SLACK_PX = 1;

/** Which side of a scrolling bar has tabs out of view. */
export type OverflowEdge = "none" | "left" | "right" | "both";

/** The sides of a bar with more tabs past its edge, so the bar can fade there and a cut tab reads as scrollable. */
export function overflowEdge(bar: { scrollLeft: number; scrollWidth: number; clientWidth: number }): OverflowEdge {
  const left = bar.scrollLeft > EDGE_SLACK_PX;
  const right = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - EDGE_SLACK_PX;
  if (left && right) return "both";
  if (left) return "left";
  return right ? "right" : "none";
}

function centerActive(bar: HTMLElement) {
  const active = bar.querySelector<HTMLElement>(ACTIVE_TAB);
  if (active && bar.scrollWidth > bar.clientWidth) {
    const barBox = bar.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    bar.scrollLeft += activeBox.left - barBox.left - (barBox.width - activeBox.width) / 2;
  }
  bar.dataset.edge = overflowEdge(bar);
}

/** Scrolls the tab bar it sits in so the current tab shows whenever `current` changes and once the web fonts settle the tab widths, when the bar is narrower than its tabs, and marks the bar's `data-edge` with the sides that hold more tabs. */
export function ActiveTabInView({ current }: { current: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const bar = marker.current?.parentElement;
    if (bar) centerActive(bar);
  }, [current]);
  useEffect(() => {
    const bar = marker.current?.parentElement;
    if (!bar) return;
    const mark = () => {
      bar.dataset.edge = overflowEdge(bar);
    };
    bar.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("resize", mark);
    document.fonts?.ready.then(() => centerActive(bar)).catch(() => undefined);
    return () => {
      bar.removeEventListener("scroll", mark);
      window.removeEventListener("resize", mark);
    };
  }, []);
  return <span ref={marker} hidden />;
}
