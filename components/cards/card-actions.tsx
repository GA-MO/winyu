"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { NextAction } from "@/lib/contracts";

/** A follow-up question a card row asks as if the user typed it; the chat has no detail pages. */
export type AskAction = { id: string; kind: "ask"; label: string; prompt: string };

/** A write tool a card form fills in (leave request, course enrolment); the chat still asks for approval before it runs. */
export type FormAction = { id: string; kind: "form"; label: string; tool: "request_leave" | "enroll_course"; input: Record<string, unknown> };

/** Everything a card button can ask the chat to do. */
export type CardAction = NextAction | AskAction | FormAction;

export type CardActions = { runAction: (action: CardAction) => void };

const NO_ACTIONS: CardActions = { runAction: () => undefined };

const CardActionsContext = createContext<CardActions>(NO_ACTIONS);

/** The chat provides what a pressed card button does; outside a chat the buttons do nothing. */
export function CardActionsProvider({ value, children }: { value: CardActions; children: ReactNode }) {
  return <CardActionsContext.Provider value={value}>{children}</CardActionsContext.Provider>;
}

export function useRunAction(): (action: CardAction) => void {
  return useContext(CardActionsContext).runAction;
}

const SendingContext = createContext(false);

/** Marks the cards of an exchange whose reply already raises a send, so none offers a send of its own beside that approval. */
export function SendingProvider({ sending, children }: { sending: boolean; children: ReactNode }) {
  return <SendingContext.Provider value={sending}>{children}</SendingContext.Provider>;
}

/** Whether the reply around this card already raises a send. */
export function useSending(): boolean {
  return useContext(SendingContext);
}

function recipientsOf(action: NextAction): string[] {
  const to = (action.input as { to?: unknown } | null)?.to;
  return Array.isArray(to) ? to.filter((id): id is string => typeof id === "string") : [];
}

/** The next steps a card offers: no send while the reply around it already raises one, and no send to people who all hold this card already (`heldBy`, whom the person sent it to), so a sent card never offers to go out twice (AI-281). */
export function offeredActions(actions: readonly NextAction[], sending: boolean, heldBy: readonly string[]): NextAction[] {
  return actions.filter((action) => {
    if (action.kind !== "send") return true;
    if (sending) return false;
    const to = recipientsOf(action);
    return to.length === 0 || !to.every((id) => heldBy.includes(id));
  });
}

/** A row press: ask the chat this question. */
export function askAction(prompt: string): AskAction {
  return { id: `ask-${prompt}`, kind: "ask", label: prompt, prompt };
}
