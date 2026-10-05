import { randomUUID } from "node:crypto";
import type { HandoffPreload, Thread } from "@/lib/contracts";
import { collection } from "@/lib/server/store/json-store";
import { TH } from "@/lib/i18n/th";
import { channelOfThread } from "@/lib/server/channels/thread-id";
import type { Channel } from "@/lib/server/channels/types";

export const THREADS_COLLECTION = "threads";

const TITLE_LENGTH = 40;

export type ThreadSummary = { id: string; title: string; createdAt: string; updatedAt: string; packetId: string | null; channel: Channel | null };

export function threads() {
  return collection<Thread>(THREADS_COLLECTION);
}

export function titleFrom(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (!trimmed) return TH.session.newThreadTitle;
  return trimmed.length > TITLE_LENGTH ? trimmed.slice(0, TITLE_LENGTH) : trimmed;
}

function summaryOf(thread: Thread): ThreadSummary {
  return { id: thread.id, title: thread.title, createdAt: thread.createdAt, updatedAt: thread.updatedAt, packetId: thread.preload?.packetId ?? null, channel: channelOfThread(thread.id) };
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

export function createThread(userId: string, firstMessage: string, preload: HandoffPreload | null = null, storyId: string | null = null): Thread {
  const now = new Date().toISOString();
  return threads().put({ id: randomUUID(), userId, title: titleFrom(firstMessage), createdAt: now, updatedAt: now, preload, storyId });
}

/** The thread a chat run belongs to: the person's own, created under the client's id with the first question as its title when the id is new; null when the id is another person's. */
export function threadForRun(id: string, userId: string, firstQuestion: string): Thread | null {
  const existing = threads().get(id);
  if (existing && existing.userId !== userId) return null;
  if (existing) return isUntitled(existing) && firstQuestion.trim() ? threads().put({ ...existing, title: titleFrom(firstQuestion) }) : existing;
  const now = new Date().toISOString();
  return threads().put({ id, userId, title: titleFrom(firstQuestion), createdAt: now, updatedAt: now, preload: null, storyId: null });
}

export function renameThread(id: string, userId: string, title: string): Thread | null {
  const thread = getThread(id, userId);
  if (!thread) return null;
  return threads().put({ ...thread, title: titleFrom(title), updatedAt: new Date().toISOString() });
}

export function deleteThread(id: string, userId: string): boolean {
  const thread = getThread(id, userId);
  if (!thread) return false;
  return threads().remove(id);
}
