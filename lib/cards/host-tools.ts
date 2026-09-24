import { z } from "zod";

/** The follow-up button's host tool: a card button puts a Thai question into the chat as the user's next message. */
export const ASK_TOOL = {
  name: "ask",
  description: "Only for Button on.press in a card, never call it yourself: puts the Thai follow-up question in `prompt` into the chat as the user's next message (e.g. \"ขอดูโปรไฟล์คุณป้อง แสนสุข\").",
  input: z.object({ prompt: z.string().min(1) }),
} as const;

/** The host tools a real chat publishes, as the chat request carries them, so an eval sees what the browser sees. */
export function hostToolDescriptors() {
  return [{ name: ASK_TOOL.name, description: ASK_TOOL.description, inputSchema: z.toJSONSchema(ASK_TOOL.input) as Record<string, unknown> }];
}
