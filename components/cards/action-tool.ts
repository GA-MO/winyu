import type { CardAction } from "./card-actions";

/** What the chat does with a pressed card button: call a write tool (behind approval) or ask a question. */
export type ActionRequest =
  | { kind: "tool"; tool: string; input: Record<string, unknown>; label: string }
  | { kind: "ask"; prompt: string; label: string };

/** Turns any card button into the one request the chat runs; null when the action carries neither a tool nor a question. */
export function actionRequest(action: CardAction): ActionRequest | null {
  if (action.kind === "ask") return { kind: "ask", prompt: action.prompt, label: action.label };
  if (action.kind === "form") return { kind: "tool", tool: action.tool, input: action.input, label: action.label };
  if (action.tool) return { kind: "tool", tool: action.tool, input: action.input ?? {}, label: action.label };
  if (action.prompt) return { kind: "ask", prompt: action.prompt, label: action.label };
  return null;
}
