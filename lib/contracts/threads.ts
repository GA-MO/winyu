export type Thread = { id: string; userId: string; title: string; createdAt: string; updatedAt: string;
  preload: HandoffPreload | null; storyId?: string | null };
export type HandoffPreload = { packetId: string; systemNote: string };
