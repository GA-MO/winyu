import { randomUUID } from "node:crypto";
import type { MatterPreload, Thread } from "@/lib/contracts";
import { collection } from "@/lib/server/store/json-store";
import { TH } from "@/lib/i18n/th";

export const THREADS_COLLECTION = "threads";

const TITLE_LENGTH = 120;
const GENERATED_TITLE_LENGTH = 60;
const QUOTES = /["'“”‘’«»「」]/g;
const TRAILING_PUNCTUATION = /[\s.。:：,，;!?]+$/u;
const NUMBER = /\d+(?:[.,]\d+)*/g;

export type ThreadSummary = { id: string; title: string; question: string | null; createdAt: string; updatedAt: string; matterCode: string | null };

export function threads() {
  return collection<Thread>(THREADS_COLLECTION);
}

export function titleFrom(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (!trimmed) return TH.session.newThreadTitle;
  return trimmed.length > TITLE_LENGTH ? `${trimmed.slice(0, TITLE_LENGTH).trimEnd()}…` : trimmed;
}

function summaryOf(thread: Thread): ThreadSummary {
  return { id: thread.id, title: thread.title, question: thread.question ?? null, createdAt: thread.createdAt, updatedAt: thread.updatedAt, matterCode: thread.preload?.matterCode ?? null };
}

/** Every thread of one user, newest first, without the message bodies. */
export function listThreads(userId: string): ThreadSummary[] {
  return threads()
    .where((thread) => thread.userId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(summaryOf);
}

export function getThread(id: string, userId: string): Thread | null {
  const thread = threads().get(id);
  return thread && thread.userId === userId ? thread : null;
}

function isUntitled(thread: Thread): boolean {
  return thread.title === TH.session.newThreadTitle;
}

/** The person's newest thread that was opened but never asked anything, so opening a new chat twice does not leave two empty threads. */
export function unusedThread(userId: string): Thread | null {
  return threads()
    .where((thread) => thread.userId === userId && isUntitled(thread) && thread.createdAt === thread.updatedAt && !thread.preload && !thread.storyId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function questionOf(firstMessage: string): string | null {
  return firstMessage.trim() ? titleFrom(firstMessage) : null;
}

export function createThread(userId: string, firstMessage: string, preload: MatterPreload | null = null, storyId: string | null = null): Thread {
  const now = new Date().toISOString();
  const named = preload ? { titledBy: "matter" as const, question: null } : { titledBy: "question" as const, question: questionOf(firstMessage) };
  return threads().put({ id: randomUUID(), userId, title: titleFrom(firstMessage), createdAt: now, updatedAt: now, preload, storyId, ...named });
}

/** The thread a chat run belongs to: the person's own, created under the client's id with the first question as its title when the id is new; null when the id is another person's. */
export function threadForRun(id: string, userId: string, firstQuestion: string): Thread | null {
  const existing = threads().get(id);
  if (existing && existing.userId !== userId) return null;
  if (existing) return isUntitled(existing) && firstQuestion.trim() ? threads().put({ ...existing, title: titleFrom(firstQuestion), titledBy: "question", question: questionOf(firstQuestion) }) : existing;
  const now = new Date().toISOString();
  return threads().put({ id, userId, title: titleFrom(firstQuestion), createdAt: now, updatedAt: now, preload: null, storyId: null, titledBy: "question", question: questionOf(firstQuestion) });
}

export function renameThread(id: string, userId: string, title: string): Thread | null {
  const thread = getThread(id, userId);
  if (!thread) return null;
  return threads().put({ ...thread, title: titleFrom(title), titledBy: "person", updatedAt: new Date().toISOString() });
}

function numbersIn(text: string): string[] {
  return text.match(NUMBER) ?? [];
}

/** A generated title as the sidebar shows it: no quotes or closing punctuation, at most GENERATED_TITLE_LENGTH characters; null when nothing is left or it carries a number the question did not, since numbers on screen come from tools, never from a model's summary. */
export function cleanGeneratedTitle(generated: string, question: string): string | null {
  const title = generated.replace(QUOTES, "").replace(/\s+/g, " ").trim().replace(TRAILING_PUNCTUATION, "");
  if (!title) return null;
  const asked = new Set(numbersIn(question));
  if (numbersIn(title).some((number) => !asked.has(number))) return null;
  return title.length > GENERATED_TITLE_LENGTH ? `${title.slice(0, GENERATED_TITLE_LENGTH).trimEnd()}…` : title;
}

/** Puts the title model's name for a thread in place of its first question, only on the person's own thread and only while the question still names it: a rename, a matter's title or a title already generated stays. Returns the thread as saved, or null when nothing changed. */
export function adoptGeneratedTitle(id: string, userId: string, generated: string): Thread | null {
  const thread = getThread(id, userId);
  if (!thread || thread.titledBy !== "question" || !thread.question) return null;
  const title = cleanGeneratedTitle(generated, thread.question);
  if (!title) return null;
  return threads().put({ ...thread, title, titledBy: "model" });
}

export function deleteThread(id: string, userId: string): boolean {
  const thread = getThread(id, userId);
  if (!thread) return false;
  return threads().remove(id);
}
