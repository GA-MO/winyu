import { CARD_FENCE } from "./catalog";

const FENCE_MARK = "```";
const NEWLINE = "\n";

/** What reading reply text yields, in order: words the person reads, a card block opening, one finished block line, the block closing. */
export type BlockEvent = { kind: "text"; text: string } | { kind: "open" } | { kind: "line"; line: string } | { kind: "close" };

function heldTail(text: string): number {
  for (let length = Math.min(text.length, CARD_FENCE.length); length > 0; length -= 1) {
    if (CARD_FENCE.startsWith(text.slice(-length))) return length;
  }
  return 0;
}

/** Splits streamed reply text into the words the person reads and the lines of the card block, holding back a fence or a line until it is complete. */
export class BlockReader {
  private inBlock = false;
  private pending = "";

  /** Reads one more piece of text. */
  push(delta: string): BlockEvent[] {
    this.pending += delta;
    const events: BlockEvent[] = [];
    for (;;) {
      if (this.inBlock) {
        const newline = this.pending.indexOf(NEWLINE);
        if (newline < 0) return events;
        const line = this.pending.slice(0, newline);
        this.pending = this.pending.slice(newline + 1);
        if (line.trim().startsWith(FENCE_MARK)) {
          this.inBlock = false;
          events.push({ kind: "close" });
        } else events.push({ kind: "line", line });
        continue;
      }
      const at = this.pending.indexOf(CARD_FENCE);
      if (at < 0) {
        const shown = this.pending.slice(0, this.pending.length - heldTail(this.pending));
        if (shown) events.push({ kind: "text", text: shown });
        this.pending = this.pending.slice(shown.length);
        return events;
      }
      if (at > 0) events.push({ kind: "text", text: this.pending.slice(0, at) });
      const newline = this.pending.indexOf(NEWLINE, at);
      if (newline < 0) {
        this.pending = this.pending.slice(at);
        return events;
      }
      this.pending = this.pending.slice(newline + 1);
      this.inBlock = true;
      events.push({ kind: "open" });
    }
  }

  /** Reads what is left when the text ends: a block the model never closed is closed here with its last line. */
  end(): BlockEvent[] {
    const rest = this.pending;
    this.pending = "";
    if (!this.inBlock) return rest && !rest.startsWith(CARD_FENCE) ? [{ kind: "text", text: rest }] : [];
    this.inBlock = false;
    const last = rest.trim();
    return last && !last.startsWith(FENCE_MARK) ? [{ kind: "line", line: rest }, { kind: "close" }] : [{ kind: "close" }];
  }
}

/** Reads a whole reply text at once, as history restore needs it. */
export function blockEventsOf(text: string): BlockEvent[] {
  const reader = new BlockReader();
  return [...reader.push(text), ...reader.end()];
}
