"use client";

import { FoldView } from "@/components/cards/charts/strip";
import { cn } from "@/components/ui/cn";
import { Card, Metric } from "@/components/ui/primitives";
import type { ReadRow } from "@/lib/cards/reading";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { ParsedCard } from "./frame";
import { ConnectorTable } from "./reference";
import { adminAuditResult, parseResult } from "./shapes";

const TITLE = TH.cards.connectorTitle.admin_audit ?? TH.admin.tools.admin_audit.label;
const TONE_TEXT: Record<string, string> = { danger: "text-danger", warning: "text-warning" };

type Row = Record<string, unknown>;

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function isAccessRow(row: Row): boolean {
  return "key_label" in row && "value_label" in row && "tone" in row;
}

function AccessList({ rows }: { rows: Row[] }) {
  return (
    <ul className="flex flex-col border-t border-border/70 pt-1">
      {rows.map((row) => (
        <li key={`${textOf(row.kind_label)}-${textOf(row.key_label)}`} className="flex min-w-0 items-baseline justify-between gap-3 py-1.5 text-[13px]">
          <span className="min-w-0 truncate text-foreground">
            {textOf(row.key_label)}
            <span className="text-muted-foreground">{` · ${textOf(row.kind_label)}`}</span>
          </span>
          <span className={cn("shrink-0 font-semibold", TONE_TEXT[textOf(row.tone)] ?? "text-muted-foreground")}>{textOf(row.value_label)}</span>
        </li>
      ))}
    </ul>
  );
}

function readRowOf(row: Row): ReadRow {
  return { label: textOf(row.key_label), sub: null, measure: null, fill: 0, text: textOf(row.value_label), change: null, tone: "neutral", exception: false, valued: true };
}

/** admin_audit: the answer first (a total as the hero when the result names one), then only the rows that need the admin's eye, the normal ones folded into one muted line. */
export function AdminAuditCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(adminAuditResult, result)} title={TITLE}>
      {({ summary, headline, rows, folded, provenance }) => (
        <Card props={{ title: TITLE, meta: headline ? undefined : summary, footnote: TH.adminAudit.footnote(provenance.sourceSystem, formatDateTh(provenance.asOf)) }}>
          {headline ? <Metric props={{ label: headline.label, value: headline.value, size: "lg" }} /> : null}
          {rows.length > 0 && rows.every(isAccessRow) ? <AccessList rows={rows} /> : <ConnectorTable rows={rows} />}
          {folded && folded.rows.length > 0 ? <FoldView fold={{ line: folded.line, rows: folded.rows.map(readRowOf) }} ruled={rows.length === 0} /> : null}
        </Card>
      )}
    </ParsedCard>
  );
}
