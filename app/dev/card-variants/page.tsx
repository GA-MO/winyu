import { notFound } from "next/navigation";
import { metricAnswerOf } from "@/lib/cards/tool-answers";
import { readRecordings } from "@/lib/eval/recording";
import { COPY } from "./copy";
import { readingOf, type Reading } from "./reading";
import { VariantA, VariantB, VariantC, VariantFrame } from "./variants";

export const dynamic = "force-dynamic";

const CASES = [
  { id: "ceo-attainment", shot: "attainment" },
  { id: "ceo-decline", shot: "decline" },
] as const;

type Shown = { id: string; shot: string; question: string; reading: Reading };

function shownCases(): Shown[] {
  const recordings = readRecordings();
  return CASES.flatMap(({ id, shot }) => {
    const recording = recordings.get(id);
    const call = recording?.steps.find((step) => step.kind === "call" && step.tool === "query_metric");
    const answer = call && call.kind === "call" ? metricAnswerOf(call.result) : null;
    if (!recording || !answer) return [];
    return [{ id, shot, question: recording.prompt, reading: readingOf(answer) }];
  });
}

/** Development only: three data-card layouts drawn from the recorded tool results of two eval cases, to pick a style by eye. */
export default function DevCardVariantsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-10 bg-background px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[17px] font-semibold tracking-tight">{COPY.pageTitle}</h1>
        <p className="text-[13px] text-muted-foreground">{COPY.pageNote}</p>
      </header>
      {shownCases().map((shown) => (
        <section key={shown.id} className="flex flex-col gap-5">
          <p className="self-end rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[14px] text-ink-foreground">{shown.question}</p>
          <VariantFrame id={`A-${shown.shot}`} label={COPY.variantA}><VariantA reading={shown.reading} /></VariantFrame>
          <VariantFrame id={`B-${shown.shot}`} label={COPY.variantB}><VariantB reading={shown.reading} /></VariantFrame>
          <VariantFrame id={`C-${shown.shot}`} label={COPY.variantC}><VariantC reading={shown.reading} /></VariantFrame>
        </section>
      ))}
    </main>
  );
}
