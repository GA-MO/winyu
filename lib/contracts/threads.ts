export type Thread = { id: string; userId: string; title: string; createdAt: string; updatedAt: string;
  messages: unknown[]; preload: HandoffPreload | null };
export type HandoffPreload = { packetId: string; systemNote: string };
