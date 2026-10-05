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

/** A pressed tool button carried in a link from outside the chat (`/c/new?press=`): the tool, its input, and the button's label for the thread title. */
export type PressCarrier = PressedTool & { label: string };

/** Encodes a pressed tool button for the `press` parameter of `/c/new`. */
export function pressParam(carrier: PressCarrier): string {
  return JSON.stringify(carrier);
}

/** Reads the `press` parameter back; null when it is not a tool button the chat can send. */
export function pressFromParam(value: string): PressCarrier | null {
  try {
    const carrier = JSON.parse(value) as Partial<PressCarrier>;
    if (typeof carrier.tool !== "string" || typeof carrier.label !== "string") return null;
    if (typeof carrier.input !== "object" || carrier.input === null || Array.isArray(carrier.input)) return null;
    return { tool: carrier.tool, input: carrier.input, label: carrier.label };
  } catch {
    return null;
  }
}
