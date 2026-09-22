"use client";

import { SpecView } from "vexa/react";
import type { Spec } from "vexa/protocol";
import { cn } from "vexa/lib/utils";

export type WidgetCard = { id: string; spec: Spec };

const COLUMNS = "gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid";
const NARROW = "columns-1 sm:columns-2";
const WIDE = "columns-1 sm:columns-2 xl:columns-3";
const WIDE_FROM = 5;

export function WidgetCards({ widgets, className }: { widgets: WidgetCard[]; className?: string }) {
  return (
    <div className={cn(COLUMNS, widgets.length >= WIDE_FROM ? WIDE : NARROW, className)}>
      {widgets.map((widget, index) => (
        <div key={widget.id} className="animate-hero-rise" style={{ animationDelay: `${index * 60}ms` }}>
          <SpecView spec={widget.spec} showDevtools={false} />
        </div>
      ))}
    </div>
  );
}
