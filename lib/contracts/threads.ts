/** Who named a thread: its first question (until the title model names it after the first answer), the title model, the person (a rename), or the matter it was opened from. Threads saved before titles were generated have none and keep their title. */
export type TitleSource = "question" | "model" | "person" | "matter";
/** A chat thread; `question` is the first question as typed (shortened like a title), kept for search once a generated title replaces it. */
export type Thread = { id: string; userId: string; title: string; createdAt: string; updatedAt: string;
  preload: MatterPreload | null; storyId?: string | null; titledBy?: TitleSource; question?: string | null };
/** The matter a thread was opened from (ถาม Winyu ต่อ on a matter): the model reads it as fenced context, never as the person's words. */
export type MatterPreload = { matterCode: string };
