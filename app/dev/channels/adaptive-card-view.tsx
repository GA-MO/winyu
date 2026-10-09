"use client";

import { cn } from "@/components/ui/cn";
import type { AdaptiveAction, AdaptiveCardJson, AdaptiveElement } from "./feed";

const SIZE: Record<string, string> = { Small: "text-xs", Default: "text-sm", Medium: "text-base", Large: "text-lg", ExtraLarge: "text-2xl" };
const COLOR: Record<string, string> = { Good: "text-success", Attention: "text-danger", Warning: "text-warning", Accent: "text-teams" };
const SPACING: Record<string, string> = { None: "mt-0", Small: "mt-1", Default: "mt-2", Medium: "mt-3", Large: "mt-4" };
const CONTAINER: Record<string, string> = { emphasis: "rounded-md bg-teams-surface p-3", warning: "rounded-md bg-warning/10 p-3", good: "rounded-md bg-success/10 p-3", attention: "rounded-md bg-danger/10 p-3" };

/** What pressing a card button does: an Action.Submit goes back to Winyu, an Action.OpenUrl opens a tab. */
export type AdaptivePress = (action: AdaptiveAction) => void;

function TextBlock({ element }: { element: AdaptiveElement }) {
  const tone = element.color && element.color !== "Default" ? COLOR[element.color] : element.isSubtle ? "text-muted-foreground" : "text-foreground";
  return (
    <p className={cn("whitespace-pre-wrap wrap-anywhere leading-snug", SIZE[element.size ?? "Default"], tone, element.weight === "Bolder" && "font-semibold", element.horizontalAlignment === "Right" && "text-right")}>
      {element.text}
    </p>
  );
}

function Element({ element, first }: { element: AdaptiveElement; first: boolean }) {
  const spacing = first ? "" : SPACING[element.spacing ?? "Default"];
  if (element.type === "TextBlock") {
    return (
      <div className={spacing}>
        <TextBlock element={element} />
      </div>
    );
  }
  if (element.type === "ColumnSet") {
    return (
      <div className={cn("flex gap-3", spacing)}>
        {(element.columns ?? []).map((column, index) => (
          <div key={index} className={column.width === "auto" ? "shrink-0" : "min-w-0 flex-1"}>
            <Elements elements={column.items ?? []} />
          </div>
        ))}
      </div>
    );
  }
  if (element.type === "Container") {
    return (
      <div className={cn(spacing, CONTAINER[element.style ?? ""])}>
        <Elements elements={element.items ?? []} />
      </div>
    );
  }
  return null;
}

function Elements({ elements }: { elements: AdaptiveElement[] }) {
  return elements.map((element, index) => <Element key={index} element={element} first={index === 0} />);
}

/** Draws the Adaptive Card subset Winyu posts to Teams (TextBlock, ColumnSet, Container, Action.Submit, Action.OpenUrl) the way Teams lays it out. */
export function AdaptiveCardView({ card, press }: { card: AdaptiveCardJson; press: AdaptivePress }) {
  const actions = card.actions ?? [];
  return (
    <div className="w-full">
      <Elements elements={card.body ?? []} />
      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <button
              key={index}
              type="button"
              onClick={() => press(action)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teams",
                action.style === "positive" ? "bg-teams text-teams-foreground hover:opacity-90" : "border border-border bg-card text-foreground hover:bg-teams-surface",
              )}
            >
              {action.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
