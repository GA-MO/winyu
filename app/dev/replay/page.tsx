import { notFound } from "next/navigation";
import { toolLabelsByName } from "@/lib/server/tools/registry";
import { replayExchanges, streamFramesOf } from "./exchanges";
import { Replay } from "./replay";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ cases?: string; enroll?: string; frame?: string; parallel?: string; ms?: string }>;

/** Development only: recorded eval replies drawn as chat exchanges (`?cases=a,b&enroll=<courseId>`), to check what the chat draws from them for $0. `frame=<n>` draws the last case as the live stream would show it at its n-th moment (`parallel=1` starts its calls together); `ms=<n>` is the answer time the finished trail reports. */
export default async function DevReplayPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const exchanges = replayExchanges((params.cases ?? "").split(",").filter(Boolean), params.enroll ?? null);
  const last = exchanges[exchanges.length - 1];
  const frames = last && params.frame !== undefined ? streamFramesOf(last, params.parallel === "1") : null;
  const frame = frames ? frames[Math.min(Number(params.frame) || 0, frames.length - 1)] : null;
  const streaming = frames !== null && frame !== frames[frames.length - 1];
  const shown = frame ? [...exchanges.slice(0, -1), frame] : exchanges;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Replay exchanges={shown} streaming={streaming} toolLabels={toolLabelsByName()} durationMs={params.ms ? Number(params.ms) : null} />
    </main>
  );
}
