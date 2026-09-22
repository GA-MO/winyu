export type MemoryFact = { id: string; userId: string; type: "interest" | "vocabulary" | "responsibility" | "preference" | "seasonal";
  value: string; confidence: number; sourceThreadId: string | null; createdAt: string; decayAt: string | null };
