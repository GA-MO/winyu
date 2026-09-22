"use client";

export type CopHostContext = { threadId: string | null; preloadPacketId: string | null };

const state: CopHostContext = { threadId: null, preloadPacketId: null };

export function setHostContext(next: Partial<CopHostContext>) {
  Object.assign(state, next);
}

export function readHostContext(): CopHostContext {
  return { ...state };
}
