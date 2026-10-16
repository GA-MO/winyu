"use client";

import { useCallback, useEffect, useRef } from "react";

const FOLLOW_SLACK_PX = 120;
const ANCHOR_GAP_PX = 16;
const EXCHANGE_SELECTOR = "[data-exchange]";

/** Where a scroll container stands: its scroll offset, the height of what it holds, and the height it shows. */
export type ScrollView = { top: number; height: number; viewport: number };

/** Where the chat rests while it follows: the bottom, but never past the start of the newest exchange, so a reply taller than the screen is read from its question down. */
export function followTarget(view: ScrollView, latestTop: number | null): number {
  const bottom = Math.max(0, view.height - view.viewport);
  if (latestTop === null) return bottom;
  return Math.min(bottom, Math.max(0, latestTop - ANCHOR_GAP_PX));
}

/** Whether the reader is still with the conversation: at or past the resting point, or within a short scroll of it; a reader who scrolled further up to read earlier content is not. */
export function isFollowing(view: ScrollView, latestTop: number | null): boolean {
  return view.top >= followTarget(view, latestTop) - FOLLOW_SLACK_PX;
}

/** The offset to scroll to as the conversation grows, or null to stay put: only forward, and only while following. */
export function nextScroll(view: ScrollView, latestTop: number | null, following: boolean): number | null {
  if (!following) return null;
  const target = followTarget(view, latestTop);
  return target > view.top + 1 ? target : null;
}

function viewOf(node: HTMLElement): ScrollView {
  return { top: node.scrollTop, height: node.scrollHeight, viewport: node.clientHeight };
}

function latestTopOf(node: HTMLElement): number | null {
  const exchanges = node.querySelectorAll<HTMLElement>(EXCHANGE_SELECTOR);
  const latest = exchanges[exchanges.length - 1];
  if (!latest) return null;
  return latest.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop;
}

/** Keeps the newest exchange in view: a new exchange (`latestKey` changes) brings the reader to its question, and while they stay near it the chat follows the reply as it grows; a reader who scrolled up is left where they are. */
export function useFollowLatest(latestKey: string | null) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  const follow = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const top = nextScroll(viewOf(node), latestTopOf(node), following.current);
    if (top !== null) node.scrollTo({ top });
  }, []);

  useEffect(() => {
    const node = scroller.current;
    const inner = content.current;
    if (!node || !inner) return;
    const observer = new ResizeObserver(follow);
    observer.observe(inner);
    observer.observe(node);
    return () => observer.disconnect();
  }, [follow]);

  useEffect(() => {
    following.current = true;
    follow();
  }, [latestKey, follow]);

  const onScroll = () => {
    const node = scroller.current;
    if (node) following.current = isFollowing(viewOf(node), latestTopOf(node));
  };

  return { scroller, content, onScroll };
}
