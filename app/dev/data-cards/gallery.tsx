"use client";

import { CardActionsProvider } from "@/components/cards/card-actions";
import { DataCard } from "@/components/cards/data-card";
import { metricTitle } from "@/lib/cards/tool-answers";
import type { DataCardSample } from "./samples";

/** A sample with what query_metric returned for the signed-in user and for its paired call. */
export type DataCardResult = DataCardSample & { result: unknown; paired: unknown[] };

const REFUSALS = [
  { caption: "refusal · ไม่มีสิทธิ์", source: { ok: false, code: "PERMISSION_DENIED", error: "บทบาทของคุณดูข้อมูลภาคอื่นไม่ได้" } },
  { caption: "refusal · ระบบต้นทางล่ม", source: { ok: false, code: "CONNECTOR_UNAVAILABLE", error: "connector timeout" } },
  { caption: "refusal · คำถามผิดรูป", source: { ok: false, code: "BAD_QUERY", error: "dims must not be empty" } },
  { caption: "pending · ยังไม่มีผล", source: null },
];

const NO_OP = { runAction: () => {} };

function Sample({ caption, question, children }: { caption: string; question: string; children: React.ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{caption}</span>
        <span className="truncate">{question}</span>
      </figcaption>
      {children}
    </figure>
  );
}

function groupsOf(results: DataCardResult[]): [string, DataCardResult[]][] {
  const groups = new Map<string, DataCardResult[]>();
  for (const result of results) groups.set(result.group, [...(groups.get(result.group) ?? []), result]);
  return [...groups];
}

/** Every DataCard variant, grouped by family, at chat width. */
export function DataCardGallery({ results }: { results: DataCardResult[] }) {
  return (
    <CardActionsProvider value={NO_OP}>
      {groupsOf(results).map(([group, samples]) => (
        <section key={group} className="mb-10">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{group}</h2>
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            {samples.map((sample) => (
              <Sample key={sample.caption} caption={sample.caption} question={sample.question}>
                <DataCard title={metricTitle(sample.result, sample.input)} source={sample.result} with={sample.paired} view={sample.view} locked={sample.locked} />
              </Sample>
            ))}
          </div>
        </section>
      ))}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">ปฏิเสธ / รอผล</h2>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          {REFUSALS.map((sample) => (
            <Sample key={sample.caption} caption={sample.caption} question="">
              <DataCard title="ยอดขายแยกภาค" source={sample.source} />
            </Sample>
          ))}
        </div>
      </section>
    </CardActionsProvider>
  );
}
