/** What a fact is about: `style` is how the person wants answers written, the rest describe them and their work. */
export const MEMORY_FACT_TYPES = ["interest", "vocabulary", "responsibility", "preference", "style", "seasonal"] as const;

export type MemoryFactType = (typeof MEMORY_FACT_TYPES)[number];

/** One thing Winyu remembers about a person: `threads` are the conversations it was heard in, `until` the day after which a dated fact no longer holds. */
export type MemoryFact = { id: string; userId: string; type: MemoryFactType;
  value: string; confidence: number; sourceThreadId: string | null; createdAt: string; decayAt: string | null;
  seen?: number; lastSeenAt?: string; threads?: string[]; until?: string | null };

/** A fact the person rejected or asked Winyu to forget; `type` null marks a phrase to forget in any fact. Learning never brings it back unless the person states it again on purpose. */
export type MemoryTombstone = { id: string; userId: string; type: MemoryFactType | null; value: string; at: string };
