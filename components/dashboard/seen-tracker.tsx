"use client";

import { useEffect, useRef, type ReactNode } from "react";

const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const DWELL_MS = 1500;
const VISIBLE_RATIO = 0.6;

/** Reports a dashboard card as seen once it has stayed on screen long enough to be read. */
export function SeenTracker({ widgetId, className, children }: { widgetId: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reported = false;
    const report = () => {
      reported = true;
      observer.disconnect();
      void fetch(QUICK_ACTIONS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intentKey: `widget:${widgetId}`, kind: "widget_view" }),
      }).catch(() => undefined);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (reported) return;
        if (entry?.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
          timer ??= setTimeout(report, DWELL_MS);
          return;
        }
        if (timer) clearTimeout(timer);
        timer = null;
      },
      { threshold: [0, VISIBLE_RATIO, 1] },
    );
    observer.observe(node);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [widgetId]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
