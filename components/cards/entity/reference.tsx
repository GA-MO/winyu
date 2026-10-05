"use client";

import Link from "next/link";
import { Badge, Card, KeyValue, ListItem, Metric, Table } from "@/components/ui/primitives";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { ParsedCard, SectionTitle } from "./frame";
import { calendarResult, connectorResult, entityResult, gapResult, memoryResult, metricsResult, parseResult } from "./shapes";

const ALCOHOL_BAN = "alcohol_ban";
const NEGATIVE = /^[−-]/;
const ENTITY_NAME_KEY = "ชื่อ";
const HIDDEN_ENTITY_KEYS = new Set(["id", ENTITY_NAME_KEY]);
const MAX_CONNECTOR_ROWS_SHOWN = 12;
const GROUPED_FROM = 10_000;
const HIDDEN_CONNECTOR_KEY = /(^|_)id$|^region$|^visited_on$|^date$|^order_value$|^score$/;

/** get_calendar: the next day that moves sales on top, every day as a row with what it did last year. */
export function CalendarCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(calendarResult, result)} title={TH.cards.calendarEmpty}>
      {({ summary, data }) => {
        const first = data[0];
        return (
          <Card props={{ title: first ? TH.cards.calendarTitle(first.name, first.when_label) : TH.cards.calendarEmpty, meta: summary, footnote: TH.cards.source.calendar }}>
            <div className="flex flex-col gap-2">
              {data.map((day) => (
                <ListItem
                  key={`${day.date}-${day.name}`}
                  props={{
                    title: day.name,
                    subtitle: day.date_label,
                    detail: day.impact_label,
                    media: "none",
                    badges: [{ label: day.kind_label, tone: day.kind === ALCOHOL_BAN ? "danger" : "neutral" }],
                    trailing: day.when_label,
                  }}
                />
              ))}
            </div>
          </Card>
        );
      }}
    </ParsedCard>
  );
}

function signTone(label: string): "good" | "bad" {
  return NEGATIVE.test(label) ? "bad" : "good";
}

function GapLine({ label, gap, share }: { label: string; gap: string; share: string | null }) {
  return (
    <li className="flex items-baseline gap-2 py-1.5 text-[13px]">
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      <span className={signTone(gap) === "bad" ? "font-semibold tabular-nums text-danger" : "font-semibold tabular-nums text-success"}>{gap}</span>
      {share ? <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{share}</span> : null}
    </li>
  );
}

/** explain_gap: the gap as the headline, then who made it and who offset it, largest first. */
export function GapCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(gapResult, result)} title={TH.cards.gap.contributors}>
      {(gap) => (
        <Card props={{ title: TH.cards.gap.title(gap.gap_label), meta: gap.period_label }}>
          <Metric props={{ label: gap.compare_label, value: gap.actual_label, delta: gap.gap_label, trend: signTone(gap.gap_label) === "bad" ? "down" : "up", detail: gap.attainment_label, size: "lg" }} />
          <SectionTitle>{TH.cards.gap.contributors}</SectionTitle>
          <ul className="divide-y divide-border/60">
            {gap.contributors.map((row) => (
              <GapLine key={row.label} label={row.label} gap={row.gap_label} share={row.share_label} />
            ))}
            {gap.rest ? <GapLine label={gap.rest.label} gap={gap.rest.gap_label} share={gap.rest.share_label} /> : null}
          </ul>
          {gap.offsetting.length > 0 ? (
            <>
              <SectionTitle>{TH.cards.gap.offsetting}</SectionTitle>
              <ul className="divide-y divide-border/60">
                {gap.offsetting.map((row) => (
                  <GapLine key={row.label} label={row.label} gap={row.gap_label} share={null} />
                ))}
              </ul>
            </>
          ) : null}
          {gap.projection ? (
            <>
              <SectionTitle>{TH.cards.gap.projection}</SectionTitle>
              <KeyValue
                props={{
                  pairs: [
                    { label: TH.cards.gap.projected, value: gap.projection.projected_label },
                    { label: TH.cards.gap.monthTarget, value: gap.projection.month_target_label },
                    { label: TH.cards.gap.attainment, value: gap.projection.attainment_label },
                  ],
                }}
              />
              <p className="text-[11px] text-muted-foreground">{gap.projection.basis}</p>
            </>
          ) : null}
        </Card>
      )}
    </ParsedCard>
  );
}

function entityValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "number" && Math.abs(value) >= GROUPED_FROM) return value.toLocaleString("th-TH");
  return String(value ?? "");
}

/** describe_entity: the master record as label and value, named by the record itself. */
export function EntityCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(entityResult, result)} title={TH.cards.entityTitle}>
      {({ summary, data }) => (
        <Card props={{ title: entityValue(data[ENTITY_NAME_KEY] ?? TH.cards.entityTitle), description: summary, footnote: TH.cards.source.master }}>
          <KeyValue
            props={{
              pairs: Object.entries(data)
                .filter(([key]) => !HIDDEN_ENTITY_KEYS.has(key))
                .map(([label, value]) => ({ label, value: entityValue(value) })),
            }}
          />
        </Card>
      )}
    </ParsedCard>
  );
}

/** recall_memory: what the assistant remembers about this user, each fact with how sure it is. */
export function MemoryCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(memoryResult, result)} title={TH.cards.memoryTitle}>
      {({ summary, data, conversations }) => (
        <Card props={{ title: TH.cards.memoryTitle, meta: summary, footnote: TH.cards.source.memory }}>
          {data.length === 0 && conversations.length === 0 ? <p className="text-sm text-muted-foreground">{TH.cards.memoryEmpty}</p> : null}
          <ul className="flex flex-col gap-2">
            {data.map((fact) => (
              <li key={fact.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{TH.account.memoryType[fact.type as keyof typeof TH.account.memoryType] ?? fact.type}</p>
                  <p className="text-sm text-foreground">{fact.value}</p>
                </div>
                <Badge props={{ label: TH.cards.memoryStatus[fact.status] ?? fact.status, tone: fact.status === "learning" ? "warning" : "success" }} />
              </li>
            ))}
          </ul>
          {conversations.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              <SectionTitle>{TH.memory.conversationsHeading}</SectionTitle>
              <ul className="flex flex-col gap-2">
                {conversations.map((conversation) => (
                  <li key={conversation.threadId}>
                    <Link href={`/c/${conversation.threadId}`} className="flex flex-col gap-0.5 rounded-xl border border-border px-3 py-2.5 transition hover:border-foreground/25">
                      <span className="text-[11px] text-muted-foreground">{`${conversation.title} · ${formatDateTh(conversation.at)}`}</span>
                      <span className="text-sm text-foreground">{conversation.question}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      )}
    </ParsedCard>
  );
}

/** list_metrics: the catalog the user can ask about, with where each number comes from and how fresh it is. */
export function MetricsListCard({ result }: { result: unknown }) {
  const columns = TH.cards.metricColumns;
  return (
    <ParsedCard parsed={parseResult(metricsResult, result)} title={TH.cards.metricsTitle}>
      {({ summary, data }) => (
        <Card props={{ title: TH.cards.metricsTitle, meta: summary, footnote: TH.cards.source.catalog }}>
          <Table
            props={{
              columns: [
                { key: "label", label: columns.label },
                { key: "source", label: columns.source, tone: "muted" },
                { key: "latest", label: columns.latest, align: "end" },
              ],
              rows: data.map((metric) => ({ label: `${metric.labelTh} (${metric.unit})`, source: `${metric.source} · ${metric.refresh}`, latest: metric.latest ?? "" })),
              nowrap: true,
            }}
          />
        </Card>
      )}
    </ParsedCard>
  );
}

function shownKeys(rows: Record<string, unknown>[]): string[] {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return keys.filter((key) => !HIDDEN_CONNECTOR_KEY.test(key) && !keys.includes(`${key}_label`));
}

function columnLabel(key: string): string {
  return TH.cards.connectorColumns[key] ?? TH.cards.connectorColumns[`${key}_label`] ?? key;
}

function cellOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** A connector tool's rows as a table: Thai labels over raw ids, masked fields named under the card. */
export function connectorCard(tool: string) {
  return function ConnectorCard({ result }: { result: unknown }) {
    const title = TH.cards.connectorTitle[tool] ?? tool;
    return (
      <ParsedCard parsed={parseResult(connectorResult, result)} title={title}>
        {({ summary, rows, provenance }) => {
          const keys = shownKeys(rows);
          const masked = provenance.masked.length > 0 ? TH.cards.connectorMasked(provenance.masked.map(columnLabel).join(", ")) : null;
          return (
            <Card props={{ title, meta: summary, description: masked, footnote: TH.cards.source.connector(provenance.sourceSystem, formatDateTh(provenance.asOf)) }}>
              {rows.length > 0 ? (
                <Table
                  props={{
                    columns: keys.map((key) => ({ key, label: columnLabel(key) })),
                    rows: rows.slice(0, MAX_CONNECTOR_ROWS_SHOWN).map((row) => Object.fromEntries(keys.map((key) => [key, cellOf(row[key])]))),
                    nowrap: true,
                  }}
                />
              ) : null}
              {rows.length > MAX_CONNECTOR_ROWS_SHOWN ? <p className="text-[11px] text-muted-foreground">{TH.cards.connectorShown(MAX_CONNECTOR_ROWS_SHOWN, rows.length)}</p> : null}
            </Card>
          );
        }}
      </ParsedCard>
    );
  };
}
