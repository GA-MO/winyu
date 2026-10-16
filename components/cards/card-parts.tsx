"use client";

import { Alert, Card, Metric } from "@/components/ui/primitives";
import type { NextAction } from "@/lib/contracts";
import type { CardParts } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { useRunAction } from "./card-actions";
import { CardBodyView } from "./charts/card-body";

const PRIMARY = "inline-flex items-center rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SECONDARY = "inline-flex items-center rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

/** One `CardParts` rendered as React, in the chat and on the dashboard alike. */
export function CardPartsView({ parts }: { parts: CardParts }) {
  if (parts.denied) {
    return (
      <Card props={{ title: parts.title, description: null, meta: null, footnote: null }}>
        <Alert props={{ title: parts.denied.title, body: parts.denied.body, tone: "warning", meta: null }} />
        <CardBodyView body={parts.body} />
        <ActionStrip actions={parts.actions} />
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
