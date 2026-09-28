"use client";

export type WinyuHostContext = { threadId: string | null; preloadPacketId: string | null };

const state: WinyuHostContext = { threadId: null, preloadPacketId: null };

export function setHostContext(next: Partial<WinyuHostContext>) {
  Object.assign(state, next);
}

export function readHostContext(): WinyuHostContext {
  return { ...state };
}
