const PRESSED_LEAD = "ผู้ใช้กดปุ่ม: เรียก";
const PRESSED_SHAPE = /^ผู้ใช้กดปุ่ม: เรียก `([A-Za-z0-9_]+)` ด้วย (\{[\s\S]*\})$/;

/** A card button that runs a tool, as it travels in the chat: the tool and the exact input the card prepared. */
export type PressedTool = { tool: string; input: Record<string, unknown> };

/** The user message a pressed tool button sends: a plain instruction the model follows, with the input it must pass unchanged. */
export function pressedText({ tool, input }: PressedTool): string {
  return `${PRESSED_LEAD} \`${tool}\` ด้วย ${JSON.stringify(input)}`;
}

/** Reads a pressed-button message back into its tool and input; null for anything the person typed. */
export function parsePressed(text: string): PressedTool | null {
  const match = PRESSED_SHAPE.exec(text.trim());
  if (!match) return null;
  try {
    const input = JSON.parse(match[2]) as unknown;
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    return { tool: match[1], input: input as Record<string, unknown> };
  } catch {
    return null;
  }
}
