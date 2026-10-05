"use client";

import type { ReactNode } from "react";
import { Alert, Card, ListItem, Metric, type ListItemProps } from "@/components/ui/primitives";
import { TH } from "@/lib/i18n/th";
import { askAction, useRunAction } from "../card-actions";
import type { Parsed } from "./shapes";

type Stat = { label: string; value: string; detail: string | null; tone: "good" | "bad" | "neutral" | null };

/** Draws a parsed tool result, or the refusal in the server's own words, or an honest "could not read". */
export function ParsedCard<T>({ parsed, title, children }: { parsed: Parsed<T>; title: string; children: (data: T) => ReactNode }) {
  if (parsed.kind === "ok") return children(parsed.data);
  const body = parsed.kind === "refused" ? parsed.error : TH.cards.unreadable;
  return (
    <Card props={{ title }}>
      <Alert props={{ title: TH.cards.refused, body, tone: "warning" }} />
    </Card>
  );
}

/** A list row whose whole surface asks the chat a follow-up question. */
export function AskRow({ prompt, ...props }: ListItemProps & { prompt: string }) {
  const run = useRunAction();
  return <ListItem props={props} onPress={() => run(askAction(prompt))} />;
}

/** A small heading inside a card body. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-[13px] font-semibold text-foreground">{children}</h4>;
}

/** The decisive numbers a tool returned, side by side. */
export function StatRow({ stats }: { stats: Stat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 @md/ui:grid-cols-3">
      {stats.map((stat) => (
        <Metric key={stat.label} props={{ label: stat.label, value: stat.value, detail: stat.detail, tone: stat.tone, size: "md" }} />
      ))}
    </div>
  );
}

/** Rows laid out to be seen all at once: one column in a chat bubble, two when there is room. */
export function RowGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 @md/ui:grid-cols-2">{children}</div>;
}
