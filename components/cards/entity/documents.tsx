"use client";

import { ChevronDown, FileText } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { TH } from "@/lib/i18n/th";
import { ParsedCard } from "./frame";
import { documentsResult, parseResult } from "./shapes";
import type { z } from "zod";

type Passage = z.infer<typeof documentsResult>["data"]["passages"][number];

const COPY = TH.documents;

function PassageRow({ passage, open }: { passage: Passage; open: boolean }) {
  return (
    <li>
      <details className="group" open={open}>
        <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium leading-snug text-foreground">{passage.section}</span>
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{[passage.title, COPY.version(passage.version), COPY.effective(passage.effective)].join(" · ")}</span>
          </span>
          <ChevronDown aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <p className="whitespace-pre-line px-3 pb-3 pl-9.5 text-[13px] leading-relaxed text-foreground/85">{passage.text}</p>
        <p className="px-3 pb-3 pl-9.5 text-[11px] text-muted-foreground">{COPY.owner(passage.owner)}</p>
      </details>
    </li>
  );
}

/** search_documents: the passages the answer rests on, best first and open, each with its document, section, version and effective date. */
export function DocumentsCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(documentsResult, result)} title={COPY.cardTitle}>
      {({ data }) => {
        if (data.passages.length === 0) return <Card props={{ title: COPY.cardTitle, description: COPY.empty, footnote: COPY.footnote }} />;
        return (
          <Card props={{ title: COPY.cardTitle, meta: COPY.cardMeta(data.passages.length), footnote: COPY.footnote }}>
            <ul className="divide-y divide-border/60 rounded-xl border border-border">
              {data.passages.map((passage, index) => (
                <PassageRow key={`${passage.doc_id}:${passage.section}:${index}`} passage={passage} open={index === 0} />
              ))}
            </ul>
          </Card>
        );
      }}
    </ParsedCard>
  );
}
