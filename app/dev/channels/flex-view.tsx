"use client";

import { cn } from "@/components/ui/cn";
import type { FlexAction, FlexBubble, FlexNode } from "./feed";

const SIZE: Record<string, string> = { xxs: "text-[10px]", xs: "text-[11px]", sm: "text-[13px]", md: "text-sm", lg: "text-base", xl: "text-lg", xxl: "text-2xl" };
const MARGIN: Record<string, string> = { none: "mt-0", xs: "mt-0.5", sm: "mt-1", md: "mt-2", lg: "mt-3", xl: "mt-4", xxl: "mt-5" };
const GAP: Record<string, string> = { none: "gap-0", xs: "gap-0.5", sm: "gap-1", md: "gap-2", lg: "gap-3", xl: "gap-4", xxl: "gap-5" };

/** What pressing a Flex button does: a postback goes back to Winyu, a URI opens a tab. */
export type FlexPress = (action: FlexAction) => void;

function Button({ node, press }: { node: FlexNode; press: FlexPress }) {
  const action = node.action;
  if (!action) return null;
  const primary = node.style === "primary";
  return (
    <button
      type="button"
      onClick={() => press(action)}
      style={primary && node.color ? { backgroundColor: node.color } : !primary && node.color ? { color: node.color } : undefined}
      className={cn(
        "w-full rounded-lg px-3 py-2 text-[13px] font-semibold transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line",
        primary ? "bg-line text-line-foreground" : node.style === "secondary" ? "bg-muted text-foreground" : "text-primary",
        MARGIN[node.margin ?? "none"],
      )}
    >
      {action.label}
    </button>
  );
}

function Node({ node, press }: { node: FlexNode; press: FlexPress }) {
  const grow = node.flex !== undefined ? { flex: node.flex } : undefined;
  if (node.type === "separator") return <hr className={cn("border-border", MARGIN[node.margin ?? "md"])} style={node.color ? { borderColor: node.color } : undefined} />;
  if (node.type === "button") return <Button node={node} press={press} />;
  if (node.type === "text") {
    return (
      <p
        style={{ ...grow, ...(node.color ? { color: node.color } : {}) }}
        className={cn("min-w-0 whitespace-pre-wrap wrap-anywhere leading-snug", SIZE[node.size ?? "md"], node.weight === "bold" && "font-bold", node.align === "end" && "text-right", node.align === "center" && "text-center", MARGIN[node.margin ?? "none"])}
      >
        {node.text}
      </p>
    );
  }
  if (node.type === "box") {
    return (
      <div style={grow} className={cn("flex min-w-0", node.layout === "horizontal" ? "flex-row" : "flex-col", GAP[node.spacing ?? "none"], MARGIN[node.margin ?? "none"])}>
        {(node.contents ?? []).map((child, index) => (
          <Node key={index} node={child} press={press} />
        ))}
      </div>
    );
  }
  return null;
}

/** Draws the LINE Flex bubble subset Winyu sends (box, text, separator, postback and URI buttons) the way LINE lays it out; colours come from the message itself, as in LINE. */
export function FlexView({ bubble, press }: { bubble: FlexBubble; press: FlexPress }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl bg-card text-foreground">
      {bubble.body ? (
        <div className="px-4 py-3.5">
          <Node node={bubble.body} press={press} />
        </div>
      ) : null}
      {bubble.footer ? (
        <div className="px-3 pb-3">
          <Node node={bubble.footer} press={press} />
        </div>
      ) : null}
    </div>
  );
}
