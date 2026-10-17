const CAUSE_CLAIM = /(แก้(?:ไข)?ปัญหา|เคลียร์ปัญหา|ติดปัญหา|เพราะ(?:ว่า)?|เนื่องจาก|สาเหตุ(?:คือ|มาจาก))(.*?)(?=\s|ของ|และ|ด่วน|ให้|ที่|ด้วย|หน่อย|หรือ|ไหม|รึ|$)/g;
const HEDGED_BEFORE = /(ว่า(?:ใช่)?|อาจ(?:จะ)?|น่าจะ|สมมติฐาน(?:ว่า)?)$/;
const ASKED_AFTER = /^\S*?(หรือไม่|หรือเปล่า|รึเปล่า|ไหม)/;
const SPACES = /\s+/g;

function squeezed(text: string): string {
  return text.replace(SPACES, "");
}

/** The cause a send's ask states as settled ("แก้ไขปัญหาเครดิต", "เพราะติดเครดิต") when the person did not type it in their question; null when the ask names no cause, only asks the receiver to check one ("ช่วยตรวจว่า…หรือไม่", "อาจ…"), or repeats the person's own words. A cause the conversation only suspects must travel as a question, never as a fact (AI-269). */
export function causeStatedAsFact(ask: string, question: string | null): string | null {
  const typed = squeezed(question ?? "");
  for (const match of ask.matchAll(CAUSE_CLAIM)) {
    const phrase = match[0];
    const start = match.index ?? 0;
    if (!match[2]) continue;
    if (HEDGED_BEFORE.test(ask.slice(0, start).trimEnd())) continue;
    if (ASKED_AFTER.test(ask.slice(start + phrase.length))) continue;
    if (typed.includes(squeezed(phrase))) continue;
    return phrase;
  }
  return null;
}
