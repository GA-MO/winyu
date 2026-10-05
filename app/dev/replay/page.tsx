import { notFound } from "next/navigation";
import { replayExchanges } from "./exchanges";
import { Replay } from "./replay";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ cases?: string; enroll?: string }>;

/** Development only: recorded eval replies drawn as chat exchanges (`?cases=a,b&enroll=<courseId>`), to check what the chat draws from them for $0. */
export default async function DevReplayPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const exchanges = replayExchanges((params.cases ?? "").split(",").filter(Boolean), params.enroll ?? null);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Replay exchanges={exchanges} />
    </main>
  );
}
