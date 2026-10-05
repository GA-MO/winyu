"use client";

import { useLayoutEffect, useRef } from "react";

const ACTIVE_TAB = '[aria-current="page"]';

/** Scrolls the tab bar it sits in so the current tab shows, when the bar is narrower than its tabs. */
export function ActiveTabInView() {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const bar = marker.current?.parentElement;
    const active = bar?.querySelector<HTMLElement>(ACTIVE_TAB);
    if (!bar || !active || bar.scrollWidth <= bar.clientWidth) return;
    const barBox = bar.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    bar.scrollLeft += activeBox.left - barBox.left - (barBox.width - activeBox.width) / 2;
  }, []);
  return <span ref={marker} hidden />;
}
