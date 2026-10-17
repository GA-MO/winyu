"use client";

import { FoldView } from "@/components/cards/charts/strip";
import { cn } from "@/components/ui/cn";
import { Card, Metric } from "@/components/ui/primitives";
import type { ReadRow } from "@/lib/cards/reading";
import type { AdminAuditTopic } from "@/lib/contracts";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { ParsedCard } from "./frame";
import { ConnectorTable } from "./reference";
import { adminAuditResult, parseResult } from "./shapes";

const TITLE = TH.cards.connectorTitle.admin_audit ?? TH.admin.tools.admin_audit.label;
const TONE_TEXT: Record<string, string> = { danger: "text-danger", warning: "text-warning" };
const MAX_ROWS = 8;
const SHOWN_WHEN_FOLDED = 5;

type Row = Record<string, unknown>;

/** One audit row as a phone draws it: who or what on the first line with a short value at its end, then what happened, then when and on whose yes. */
type Item = { primary: string; note: string; aside: string; tone: string; detail: string; meta: string };

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function joined(...parts: unknown[]): string {
  return parts.map(textOf).filter((part) => part !== "").join(" · ");
}

function countOf(value: unknown): number {
  return typeof value === "number" ? value : Number(textOf(value)) || 0;
}

function item(fields: Partial<Item> & { primary: string }): Item {
  return { note: "", aside: "", tone: "", detail: "", meta: "", ...fields };
}

const ITEM_OF: Record<AdminAuditTopic, (row: Row) => Item> = {
  activity: (row) =>
    item({
      primary: row.to_names ? `${textOf(row.user_name)} → ${textOf(row.to_names)}` : textOf(row.user_name),
      detail: joined(row.action_label, row.subject_label),
      meta: joined(row.at_label, row.approval_label),
    }),
  denials: (row) =>
    item({
      primary: textOf(row.user_name),
      note: textOf(row.role_label),
      detail: joined(row.asked_label || row.tool_label, row.reason || row.code_label),
      meta: joined(row.at_label, row.policy_label ? TH.adminAudit.policyShort : ""),
      tone: row.policy_label ? "" : "danger",
    }),
  tool_usage: (row) =>
    item({ primary: textOf(row.tool_label), aside: TH.adminAudit.times(countOf(row.calls)), meta: TH.adminAudit.deniedMasked(countOf(row.denied), countOf(row.masked)) }),
  user_usage: (row) =>
    item({ primary: textOf(row.user_name), note: textOf(row.role_label), aside: TH.adminAudit.questions(countOf(row.questions)), meta: TH.adminAudit.calls(countOf(row.calls)) }),
  model_cost: (row) => item({ primary: textOf(row.source_label), aside: textOf(row.cost_label) }),
  connectors: (row) => item({ primary: textOf(row.connector_label), aside: textOf(row.status_label), tone: row.since_label ? "danger" : "", meta: textOf(row.since_label) }),
  overrides: (row) => item({ primary: textOf(row.key_label), note: textOf(row.role_label || row.kind_label), aside: textOf(row.value_label), meta: joined(row.by_name, row.at_label) }),
  role_access: (row) => item({ primary: textOf(row.key_label), note: textOf(row.kind_label), aside: textOf(row.value_label), tone: textOf(row.tone) }),
};

function AuditItem({ entry }: { entry: Item }) {
  return (
    <li className="flex flex-col gap-0.5 py-2 text-[13px]">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="min-w-0 break-words font-medium text-foreground">
          {entry.primary}
          {entry.note ? <span className="font-normal text-muted-foreground">{` · ${entry.note}`}</span> : null}
        </span>
        {entry.aside ? <span className={cn("shrink-0 font-semibold tabular-nums", TONE_TEXT[entry.tone] ?? "text-foreground")}>{entry.aside}</span> : null}
      </div>
      {entry.detail ? <p className={cn("line-clamp-2", entry.aside ? "text-foreground" : (TONE_TEXT[entry.tone] ?? "text-foreground"))}>{entry.detail}</p> : null}
      {entry.meta ? <p className="text-[12px] text-muted-foreground">{entry.meta}</p> : null}
    </li>
  );
}

function foldRowOf(entry: Item): ReadRow {
  return { label: entry.primary, sub: null, measure: null, fill: 0, text: entry.aside || entry.meta, change: null, tone: "neutral", exception: false, valued: true };
}

/** Every row stacked to fit a phone; past eight rows only the first five are drawn and the rest fold into one line, unless the result already folded its normal rows apart and every row left is an exception. */
function AuditList({ items, exceptions }: { items: Item[]; exceptions: boolean }) {
  const folds = !exceptions && items.length > MAX_ROWS;
  const shown = folds ? items.slice(0, SHOWN_WHEN_FOLDED) : items;
  const rest = folds ? items.slice(SHOWN_WHEN_FOLDED) : [];
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border/70 border-t border-border/70">
        {shown.map((entry, index) => (
          <AuditItem key={`${entry.primary}-${index}`} entry={entry} />
        ))}
      </ul>
      {rest.length > 0 ? <FoldView fold={{ line: TH.adminAudit.more(rest.length), rows: rest.map(foldRowOf) }} ruled /> : null}
    </div>
  );
}

function readRowOf(row: Row): ReadRow {
  return { label: textOf(row.key_label), sub: null, measure: null, fill: 0, text: textOf(row.value_label), change: null, tone: "neutral", exception: false, valued: true };
}

function verdictOf(summary: string, asOf: string): string {
  const stamp = `${TH.adminAudit.systemAsOf(formatDateTh(asOf))} · `;
  return summary.startsWith(stamp) ? summary.slice(stamp.length) : summary;
}

/** admin_audit: the verdict under the topic's title, a total as the hero when the result names one, then each row stacked to fit a phone, the normal ones folded into one muted line. */
export function AdminAuditCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(adminAuditResult, result)} title={TITLE}>
      {({ topic, summary, headline, rows, folded, provenance }) => {
        const title = topic ? (TH.adminAudit.topic[topic] ?? TITLE) : TITLE;
        return (
          <Card props={{ title, meta: headline ? undefined : verdictOf(summary, provenance.asOf), footnote: TH.adminAudit.footnote(provenance.sourceSystem, formatDateTh(provenance.asOf)) }}>
            {headline ? <Metric props={{ label: headline.label, value: headline.value, size: "lg" }} /> : null}
            {topic ? rows.length > 0 ? <AuditList items={rows.map(ITEM_OF[topic])} exceptions={Boolean(folded)} /> : null : <ConnectorTable rows={rows} />}
            {folded && folded.rows.length > 0 ? <FoldView fold={{ line: folded.line, rows: folded.rows.map(readRowOf) }} ruled={rows.length === 0} /> : null}
          </Card>
        );
      }}
    </ParsedCard>
  );
}
