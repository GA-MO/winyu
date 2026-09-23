"use client";

import { Alert, Card, Metric } from "vexa/react";
import { useVexaHostContext } from "vexa/react";
import type { NextAction } from "@/lib/contracts";
import type { CardParts } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { CardBodyView } from "./charts/card-body";

const ACTION_TOOL = "cop_action";
const PRIMARY = "inline-flex items-center rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SECONDARY = "inline-flex items-center rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ActionStrip({ actions }: { actions: NextAction[] }) {
  const host = useVexaHostContext();
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
            onClick={() => void host?.runTool(ACTION_TOOL, action, { source: "button", toolCallId: `${ACTION_TOOL}-${action.id}` })}
            className={index === 0 ? PRIMARY : SECONDARY}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One `CardParts` rendered as React — the same card the dashboard renders as a Vexa spec. */
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
      {parts.hero ? <Metric props={{ ...parts.hero, note: null, size: "lg" }} /> : null}
      <CardBodyView body={parts.body} />
      <ActionStrip actions={parts.actions} />
    </Card>
  );
}
