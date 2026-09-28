"use client";

import { z } from "zod";
import { defineTool, formatActionMessage } from "vexa/react";
import { TH } from "@/lib/i18n/th";
import { ASK_TOOL } from "@/lib/cards/host-tools";

const NEW_THREAD = "/c/new";

const actionSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  reason: z.string(),
  tool: z.string().nullable(),
  input: z.record(z.string(), z.unknown()).nullable(),
  prompt: z.string().nullable(),
});

type WinyuAction = z.infer<typeof actionSchema>;

function messageOf(action: WinyuAction): string | null {
  if (action.tool) return formatActionMessage(action.tool, action.input ?? {});
  return action.prompt;
}

/**
 * The one host tool every next-action button presses. A tool action becomes the same button-press message the chat
 * already understands, so the model still runs it behind an approval card; a question is simply asked.
 */
export function winyuActionTool(send: (text: string) => boolean) {
  return defineTool({
    description: "Run the next action a Winyu card offers: hand off to the owner, request access, pin the card, verify an alert, or drill in.",
    input: actionSchema,
    run: (action: WinyuAction) => {
      const message = messageOf(action);
      if (!message) return { ok: false as const, error: TH.next.noAction };
      if (send(message)) return { ok: true as const, summary: action.label };
      window.location.assign(`${NEW_THREAD}?prompt=${encodeURIComponent(message)}`);
      return { ok: true as const, summary: action.label };
    },
  });
}

/**
 * A card button that asks a follow-up in the chat, as if the user typed it: the chat has no detail pages, so pressing
 * "more about X" is a question the model answers with its own tools.
 */
export function askTool(send: (text: string) => boolean) {
  return defineTool({
    description: ASK_TOOL.description,
    input: ASK_TOOL.input,
    run: ({ prompt }: z.infer<typeof ASK_TOOL.input>) => {
      if (send(prompt)) return { ok: true as const, summary: prompt };
      window.location.assign(`${NEW_THREAD}?prompt=${encodeURIComponent(prompt)}`);
      return { ok: true as const, summary: prompt };
    },
  });
}
