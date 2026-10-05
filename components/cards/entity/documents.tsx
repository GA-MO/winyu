"use client";

import { ChevronDown, FileSearch, FileText } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { splitByCitation } from "@/lib/cards/citations";
import { TH } from "@/lib/i18n/th";
import type { ReplyText } from "../registry";
import { ParsedCard } from "./frame";
import { documentsResult, parseResult } from "./shapes";
import type { ReactNode } from "react";
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

function PassageList({ passages, openFirst }: { passages: readonly Passage[]; openFirst: boolean }) {
  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border">
      {passages.map((passage, index) => (
        <PassageRow key={`${passage.doc_id}:${passage.section}:${index}`} passage={passage} open={openFirst && index === 0} />
      ))}
    </ul>
  );
}

function Expandable({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <details className="group/expand">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown aria-hidden className="size-3.5 shrink-0 transition-transform group-open/expand:rotate-180" />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function SearchedOnly({ headline, passages }: { headline: string; passages: readonly Passage[] }) {
  return (
    <section className="w-full rounded-2xl border border-border/70 bg-card px-3.5 py-2.5">
      <Expandable
        label={
          <>
            <FileSearch aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-[13.5px] text-foreground">{headline}</span>
            <span className="text-[11.5px]">{COPY.searched(passages.length)}</span>
          </>
        }
      >
        <PassageList passages={passages} openFirst={false} />
      </Expandable>
    </section>
  );
}

/** search_documents: the passages the reply cites, first and open, each with its document, section, version and effective date; passages it searched but did not cite stay folded, and a reply that cites none shows one not-found line. */
export function DocumentsCard({ result, reply }: { result: unknown; reply: ReplyText }) {
  return (
    <ParsedCard parsed={parseResult(documentsResult, result)} title={COPY.cardTitle}>
      {({ data }) => {
        if (data.passages.length === 0) return <Card props={{ title: COPY.cardTitle, description: COPY.empty, footnote: COPY.footnote }} />;
        const { cited, searched } = splitByCitation(data.passages, reply.text);
        if (cited.length === 0) return <SearchedOnly headline={reply.streaming ? COPY.searching : COPY.notFound} passages={searched} />;
        return (
          <Card props={{ title: COPY.cardTitle, meta: COPY.cited(cited.length), footnote: COPY.footnote }}>
            <PassageList passages={cited} openFirst />
            {searched.length > 0 ? (
              <Expandable label={COPY.otherPassages(searched.length)}>
                <PassageList passages={searched} openFirst={false} />
              </Expandable>
            ) : null}
          </Card>
        );
      }}
    </ParsedCard>
  );
}
