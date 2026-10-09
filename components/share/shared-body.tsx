"use client";

import { useState } from "react";
import type { ShareScope } from "@/lib/contracts";
import type { ComposedSurface } from "@/lib/compose/catalog";
import { ShareScopeNotice, type SentRequest } from "./share-scope-notice";
import { SharedCardView, type FreshReadView } from "./shared-card-view";

/** The scope once the viewer asked: their request is pending and nothing is requestable any more. */
export function scopeAfterRequest(scope: ShareScope, request: SentRequest): ShareScope {
  return { ...scope, pendingRequest: request, requestable: false };
}

/** The reads with every locked row's ขอดู dropped once there is nothing left to request. */
export function readsForScope(reads: readonly FreshReadView[], scope: ShareScope | null): FreshReadView[] {
  if (!scope || scope.requestable) return [...reads];
  return reads.map((read) => (read.locked ? { ...read, locked: { ...read.locked, askHref: null } } : read));
}

/** A shared card with what it hides from the viewer: one scope for the notice and the locked rows, so asking updates both without a reload. */
export function SharedBody({ scope: initial, reads, surface, shareCode, senderName }: { scope: ShareScope | null; reads: FreshReadView[]; surface: ComposedSurface | null; shareCode: string; senderName: string | null }) {
  const [scope, setScope] = useState(initial);
  return (
    <>
      {scope && senderName ? <ShareScopeNotice scope={scope} shareCode={shareCode} senderName={senderName} onRequested={(request) => setScope(scopeAfterRequest(scope, request))} /> : null}
      <SharedCardView reads={readsForScope(reads, scope)} surface={surface} />
    </>
  );
}
