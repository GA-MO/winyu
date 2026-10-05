"use client";

import { Children, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TH } from "@/lib/i18n/th";

const NAV_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary";

/** Horizontal choice row: each slide snaps into place, the arrows page by one slide. */
export function Carousel({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children);
  if (slides.length === 0) return null;

  const page = (direction: 1 | -1) => {
    const node = track.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    node.scrollBy({ left: direction * (first?.offsetWidth ?? node.clientWidth) + direction * 12, behavior: "smooth" });
  };

  return (
    <div className="@container/ui space-y-2">
      <div ref={track} className="ui-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {slides.map((slide, index) => (
          <div key={index} className="min-w-0 shrink-0 grow-0 basis-[85%] snap-start @md/ui:basis-[44%]">
            {slide}
          </div>
        ))}
      </div>
      {slides.length > 1 ? (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="text-[11px] text-muted-foreground/70">{TH.chat.carouselHint}</p>
          <div className="flex gap-1.5">
            <button type="button" aria-label={TH.chat.carouselPrevious} onClick={() => page(-1)} className={NAV_BUTTON}>
              <ChevronLeft aria-hidden size={18} strokeWidth={2} />
            </button>
            <button type="button" aria-label={TH.chat.carouselNext} onClick={() => page(1)} className={NAV_BUTTON}>
              <ChevronRight aria-hidden size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
