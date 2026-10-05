import { TH } from "@/lib/i18n/th";

const DIGIT_RUN = /[0-9๐-๙]+(?:[,./:-][0-9๐-๙]+)*/g;

/** How many characters of a recalled reply the model reads. */
export const REPLY_CHARS = 280;

/** Replaces every number in recalled text (Arabic or Thai digits, with separators inside) by a mask, so an old figure can never be repeated as if current. */
export function maskNumbers(text: string): string {
  return text.replace(DIGIT_RUN, TH.memory.maskedNumber);
}

/** Cuts text to at most `limit` characters, marking the cut. */
export function truncate(text: string, limit: number): string {
  const chars = [...text.trim()];
  if (chars.length <= limit) return chars.join("");
  return `${chars.slice(0, limit - 1).join("").trimEnd()}${TH.memory.truncated}`;
}
