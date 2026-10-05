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

/** A row press: ask the chat this question. */
export function askAction(prompt: string): AskAction {
  return { id: `ask-${prompt}`, kind: "ask", label: prompt, prompt };
}
