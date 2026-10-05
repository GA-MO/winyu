import type { ContextRef } from "./events";
import type { ContextItem } from "./types";

/** Items at or above this priority are what the model must always know (who is asking, their scope, today); the budget never drops them. */
export const REQUIRED_PRIORITY = 100;

export type Composed<Item extends ContextItem = ContextItem> = { kept: Item[]; dropped: Item[] };

/** Fits the items into a character budget: the required ones always, then the rest by priority, highest first; kept items stay in their given order because prompt order matters. */
export function withinBudget<Item extends ContextItem>(items: readonly Item[], maxChars: number): Composed<Item> {
  const byPriority = [...items].sort((left, right) => right.priority - left.priority);
  const keptIds = new Set<string>();
  let used = 0;
  for (const item of byPriority) {
    const fits = used + item.content.length <= maxChars;
    if (item.priority < REQUIRED_PRIORITY && !fits) continue;
    keptIds.add(item.id);
    used += item.content.length;
  }
  return { kept: items.filter((item) => keptIds.has(item.id)), dropped: items.filter((item) => !keptIds.has(item.id)) };
}

export function refsOf(items: readonly ContextItem[]): ContextRef[] {
  return items.map((item) => ({ id: item.id, kind: item.kind, source: item.source, scope: item.scope, priority: item.priority, chars: item.content.length }));
}

type Speaker = { role?: unknown };

/** The newest stretch of a conversation that fits the budget: oldest messages go first, never below a floor, and the window widens back to open on the person's own message. */
export function transcriptWindow<Message extends Speaker>(messages: readonly Message[], maxChars: number, minMessages: number): { kept: Message[]; dropped: number } {
  const sizes = messages.map((message) => JSON.stringify(message).length);
  let start = 0;
  let total = sizes.reduce((sum, size) => sum + size, 0);
  while (total > maxChars && messages.length - start > minMessages) {
    total -= sizes[start];
    start += 1;
  }
  while (start > 0 && messages[start].role !== "user") start -= 1;
  return { kept: messages.slice(start), dropped: start };
}
