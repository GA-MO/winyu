"use client";

import { z } from "zod";
import { defineTool, formatActionMessage } from "vexa/react";
import { TH } from "@/lib/i18n/th";

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

type CopAction = z.infer<typeof actionSchema>;

function messageOf(action: CopAction): string | null {
  if (action.tool) return formatActionMessage(action.tool, action.input ?? {});
  return action.prompt;
}

/**
 * The one host tool every next-action button presses. A tool action becomes the same button-press message the chat
 * already understands, so the model still runs it behind an approval card; a question is simply asked.
 */
export function copActionTool(send: (text: string) => boolean) {
  return defineTool({
    description: "Run the next action a Cop card offers: hand off to the owner, request access, pin the card, verify an alert, or drill in.",
    input: actionSchema,
    run: (action: CopAction) => {
      const message = messageOf(action);
      if (!message) return { ok: false as const, error: TH.next.noAction };
      if (send(message)) return { ok: true as const, summary: action.label };
      window.location.assign(`${NEW_THREAD}?prompt=${encodeURIComponent(message)}`);
      return { ok: true as const, summary: action.label };
    },
  });
}
