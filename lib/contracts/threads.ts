export type Thread = { id: string; userId: string; title: string; createdAt: string; updatedAt: string;
  preload: MatterPreload | null; storyId?: string | null };
/** The matter a thread was opened from (ถาม Winyu ต่อ on a matter): the model reads it as fenced context, never as the person's words. */
export type MatterPreload = { matterCode: string };
