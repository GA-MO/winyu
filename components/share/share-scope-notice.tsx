"use client";

import { useEffect, useRef, useState } from "react";
import { EyeOff, KeyRound } from "lucide-react";
import type { ShareScope } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { GRANT_REQUEST_ANCHOR, sliceLabel, untilLabel } from "@/lib/share/grant-label";

const REQUESTS_ENDPOINT = "/api/grants/requests";
const REASON_MAX = 300;

type Phase = { kind: "idle" } | { kind: "writing" } | { kind: "sending" } | { kind: "sent"; approverName: string } | { kind: "failed" };

function Request({ shareCode }: { shareCode: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [reason, setReason] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const openOnAsk = () => {
      if (window.location.hash === `#${GRANT_REQUEST_ANCHOR}`) setPhase((current) => (current.kind === "idle" ? { kind: "writing" } : current));
    };
    window.addEventListener("hashchange", openOnAsk);
    return () => window.removeEventListener("hashchange", openOnAsk);
  }, []);

  useEffect(() => {
    if (phase.kind === "writing") reasonRef.current?.focus();
  }, [phase.kind]);

  const send = async () => {
    setPhase({ kind: "sending" });
    const response = await fetch(REQUESTS_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shareCode, reason }) }).catch(() => null);
    const payload = response?.ok ? ((await response.json()) as { approverName: string }) : null;
    setPhase(payload ? { kind: "sent", approverName: payload.approverName } : { kind: "failed" });
  };

  if (phase.kind === "sent") return <p className="text-sm text-foreground">{TH.grant.pending(phase.approverName)}</p>;
  if (phase.kind === "idle") {
    return (
      <button type="button" onClick={() => setPhase({ kind: "writing" })} className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-3.5 py-2 text-xs font-medium text-foreground transition hover:border-foreground/25">
        <KeyRound className="size-3.5" aria-hidden />
        {TH.grant.request}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))} placeholder={TH.grant.reasonPlaceholder} rows={2} className="resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
      {phase.kind === "failed" ? <p className="text-xs text-danger">{TH.grant.requestFailed}</p> : null}
      <button type="button" onClick={() => void send()} disabled={phase.kind === "sending"} className="inline-flex items-center gap-1.5 self-start rounded-full bg-ink px-4 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 disabled:opacity-40">
        <KeyRound className="size-3.5" aria-hidden />
        {phase.kind === "sending" ? TH.grant.requesting : TH.grant.request}
      </button>
    </div>
  );
}

/** What a shared card hides from its viewer that the sender saw, and the way to more: the grant they hold, the request they made, or a request to make. */
export function ShareScopeNotice({ scope, shareCode, senderName }: { scope: ShareScope; shareCode: string; senderName: string }) {
  if (scope.grant) {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground" data-share-scope="granted">
        <KeyRound className="size-4 shrink-0 text-success" aria-hidden />
        {TH.grant.holding(scope.grant.grantorName, untilLabel(scope.grant.expiresAt))}
      </p>
    );
  }
  return (
    <section id={GRANT_REQUEST_ANCHOR} className="flex scroll-mt-6 flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3" data-share-scope="hidden">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        {TH.grant.hiddenNotice(senderName, sliceLabel(scope.hidden))}
      </p>
      {scope.pendingRequest ? <p className="text-sm text-muted-foreground">{TH.grant.pending(scope.pendingRequest.approverName)}</p> : null}
      {!scope.pendingRequest && scope.requestable ? <Request shareCode={shareCode} /> : null}
      {!scope.pendingRequest && !scope.requestable ? <p className="text-xs text-muted-foreground">{TH.grant.noApprover}</p> : null}
    </section>
  );
}
