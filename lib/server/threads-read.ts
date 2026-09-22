import { randomUUID } from "node:crypto";
import type { HandoffPreload, Thread } from "@/lib/contracts";
import { collection } from "@/lib/server/store/json-store";
import { TH } from "@/lib/i18n/th";

export const THREADS_COLLECTION = "threads";

const TITLE_LENGTH = 40;

export type ThreadSummary = { id: string; title: string; createdAt: string; updatedAt: string; packetId: string | null };

export function threads() {
  return collection<Thread>(THREADS_COLLECTION);
}

export function titleFrom(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (!trimmed) return TH.session.newThreadTitle;
  return trimmed.length > TITLE_LENGTH ? trimmed.slice(0, TITLE_LENGTH) : trimmed;
}

function summaryOf(thread: Thread): ThreadSummary {
  return { id: thread.id, title: thread.title, createdAt: thread.createdAt, updatedAt: thread.updatedAt, packetId: thread.preload?.packetId ?? null };
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

export function createThread(userId: string, firstMessage: string, preload: HandoffPreload | null = null): Thread {
  const now = new Date().toISOString();
  return threads().put({ id: randomUUID(), userId, title: titleFrom(firstMessage), createdAt: now, updatedAt: now, messages: [], preload });
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
