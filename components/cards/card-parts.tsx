"use client";

import { ArrowRight } from "lucide-react";
import { Alert, Card, Metric } from "@/components/ui/primitives";
import type { NextAction } from "@/lib/contracts";
import type { CardParts } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { useRunAction } from "./card-actions";
import { CardBodyView } from "./charts/card-body";

const PRIMARY = "inline-flex items-center rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SECONDARY = "inline-flex items-center rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const FOOTER_LINK = "inline-flex max-w-[55%] shrink-0 items-center gap-1 text-xs font-medium text-foreground/75 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ActionStrip({ actions }: { actions: NextAction[] }) {
  const run = useRunAction();
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium text-muted-foreground">{TH.next.title}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            title={action.reason}
            onClick={() => run(action)}
            className={index === 0 ? PRIMARY : SECONDARY}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A dashboard card's closing line: where the numbers come from, and its first next step as a link; the full set of steps lives in the chat. */
export function CardFooter({ note, action }: { note: string | null; action: NextAction | null }) {
  const run = useRunAction();
  if (!note && !action) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2.5">
      <p className="min-w-0 flex-1 text-[11px] leading-normal text-muted-foreground/80">{note}</p>
      {action ? (
        <button type="button" title={action.reason} onClick={() => run(action)} className={FOOTER_LINK}>
          <span className="truncate">{action.label}</span>
          <ArrowRight className="size-3 shrink-0" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** One `CardParts` rendered as React, in the chat and on the dashboard alike. */
export function CardPartsView({ parts }: { parts: CardParts }) {
  if (parts.denied) {
    return (
      <Card props={{ title: parts.title, description: null, meta: null, footnote: null }}>
        <Alert props={{ title: TH.dash.denied, body: parts.denied, tone: "warning", meta: null }} />
      </Card>
    );
  }
  return (
    <Card props={{ title: parts.title, description: parts.description, meta: parts.meta, footnote: parts.footnote }}>
      {parts.hero ? <Metric props={{ ...parts.hero, size: "lg" }} /> : null}
      <CardBodyView body={parts.body} />
      <ActionStrip actions={parts.actions} />
    </Card>
  );
}
