"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ListChecks, LoaderCircle, X } from "lucide-react";
import { TH } from "@/lib/i18n/th";
import { trailSummary, type Trail, type TrailEntry } from "./trail";

const STILL_WORKING_AFTER_S = 6;
const TICK_MS = 1000;
const LIVE_JOIN = " และ ";
const DETAIL_SEPARATOR = " · ";

function useSecondsOn(key: string): number {
  const [tick, setTick] = useState({ key, seconds: 0 });
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setTick({ key, seconds: Math.floor((Date.now() - started) / TICK_MS) }), TICK_MS);
    return () => clearInterval(timer);
  }, [key]);
  return tick.key === key ? tick.seconds : 0;
}

function nowText(entry: TrailEntry): string {
  return TH.trail.now(entry.action.action, entry.action.detail);
}

function pastText(entry: TrailEntry): string {
  return entry.state === "failed" ? TH.trail.failed(entry.action.action) : TH.trail.done(entry.action.action);
}

function Mark({ state }: { state: TrailEntry["state"] }) {
  if (state === "running") return <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" aria-hidden />;
  if (state === "failed") return <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
  return <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />;
}

function RunningText({ text }: { text: string }) {
  return <span className="ui-shimmer min-w-0 bg-linear-to-r from-muted-foreground via-foreground to-muted-foreground bg-size-[200%_100%] bg-clip-text text-transparent">{text}</span>;
}

function LiveEntry({ entry }: { entry: TrailEntry }) {
  return (
    <li className="flex items-start gap-2">
      <Mark state={entry.state} />
      {entry.state === "running" ? <RunningText text={nowText(entry)} /> : <span className="min-w-0 text-muted-foreground">{pastText(entry)}</span>}
    </li>
  );
}

function currentOf(trail: Trail): string | null {
  const running = trail.entries.filter((entry) => entry.state === "running").map(nowText);
  if (running.length > 0) return running.join(LIVE_JOIN);
  if (trail.pause === "planning") return TH.trail.planning;
  if (trail.pause === "reading") return TH.trail.reading;
  return null;
}

function RunningTrail({ trail }: { trail: Trail }) {
  const current = currentOf(trail);
  const seconds = useSecondsOn(current ?? "");
  const pause = trail.pause === null ? null : trail.pause === "planning" ? TH.trail.planning : TH.trail.reading;
  if (trail.entries.length === 0 && !current) return null;
  return (
    <section aria-label={TH.trail.listLabel} className="flex flex-col gap-1.5 text-sm">
      <ol className="flex flex-col gap-1.5">
        {trail.entries.map((entry) => (
          <LiveEntry key={entry.id} entry={entry} />
        ))}
        {pause ? (
          <li className="flex items-start gap-2">
            <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
            <RunningText text={pause} />
          </li>
        ) : null}
      </ol>
      {current && seconds >= STILL_WORKING_AFTER_S ? (
        <p className="pl-5.5 text-xs text-muted-foreground" aria-hidden>
          {TH.trail.stillWorking(seconds)}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {current ?? ""}
      </p>
    </section>
  );
}

function FinishedTrail({ trail, durationMs }: { trail: Trail; durationMs: number | null }) {
  const summary = trailSummary(trail, durationMs);
  if (!summary) return null;
  return (
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ListChecks className="size-3.5 shrink-0" aria-hidden />
        {summary}
        <ChevronDown className="size-3.5 shrink-0 transition group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="mt-2 flex flex-col gap-1.5" aria-label={TH.trail.listLabel}>
        {trail.entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2">
            <Mark state={entry.state} />
            <span className="min-w-0 text-muted-foreground">
              {[pastText(entry), entry.action.detail].filter(Boolean).join(DETAIL_SEPARATOR)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** What the agent is doing for one answer: while it streams, a list that grows with each action named from its call (a spinner on the ones running now, a check on the finished ones) and what it does between steps; once it ends, one quiet line that opens to the list. */
export function ActionTrail({ trail, streaming, durationMs }: { trail: Trail; streaming: boolean; durationMs: number | null }) {
  return streaming ? <RunningTrail trail={trail} /> : <FinishedTrail trail={trail} durationMs={durationMs} />;
}
