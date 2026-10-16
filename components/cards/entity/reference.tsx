"use client";

import Link from "next/link";
import { Badge, Card, KeyValue, ListItem, Table } from "@/components/ui/primitives";
import { DIMS, METRIC_IDS } from "@/lib/contracts";
import { presentGap } from "@/lib/cards/present";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { CardPartsView } from "../card-parts";
import { ParsedCard, SectionTitle } from "./frame";
import { calendarResult, connectorResult, entityResult, gapResult, memoryResult, metricsResult, parseResult } from "./shapes";

const ALCOHOL_BAN = "alcohol_ban";
const ENTITY_NAME_KEY = "ชื่อ";
const THAI = /[\u0E00-\u0E7F]/;
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

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return allowed.find((entry) => entry === value) ?? null;
}

/** explain_gap: drawn by the shared card anatomy from the gap decision table (R11), with the metric and split the model asked for. */
export function GapCard({ result, args }: { result: unknown; args: unknown }) {
  const asked = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
  return (
    <ParsedCard parsed={parseResult(gapResult, result)} title={TH.cards.gap.contributors}>
      {(answer) => <CardPartsView parts={presentGap({ answer, metric: oneOf(METRIC_IDS, asked.metric), split: oneOf(DIMS, asked.split) })} />}
    </ParsedCard>
  );
}

function entityValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "number" && Math.abs(value) >= GROUPED_FROM) return value.toLocaleString("th-TH");
  return String(value ?? "");
}

/** describe_entity: the master record as label and value, named by the record itself. */
/** A master-data field the card shows: a Thai label other than the name it is titled with; an English key (id, ownerId) is for the model to act on and never reaches the person. */
function isShownField(key: string): boolean {
  return key !== ENTITY_NAME_KEY && THAI.test(key);
}

export function EntityCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(entityResult, result)} title={TH.cards.entityTitle}>
      {({ summary, data }) => (
        <Card props={{ title: entityValue(data[ENTITY_NAME_KEY] ?? TH.cards.entityTitle), description: summary, footnote: TH.cards.source.master }}>
          <KeyValue
            props={{
              pairs: Object.entries(data)
                .filter(([key]) => isShownField(key))
                .map(([label, value]) => ({ label, value: entityValue(value) })),
            }}
          />
        </Card>
      )}
    </ParsedCard>
  );
}

/** When a past conversation was had, and its title only when the title is not the start of the question shown under it. */
function conversationMeta(conversation: { title: string; at: string; question: string }): string {
  const when = formatDateTh(conversation.at);
  const title = conversation.title.trim();
  return title && !conversation.question.trim().startsWith(title) ? `${title} · ${when}` : when;
}

/** recall_memory: what the assistant remembers about this user, each fact with how sure it is, and past conversations in the person's own words. */
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
                      <span className="text-[11px] text-muted-foreground">{conversationMeta(conversation)}</span>
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

/** A connector result's rows as a table with Thai column labels, cut to the first rows a phone shows with a line saying how many there were. */
export function ConnectorTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const keys = shownKeys(rows);
  return (
    <>
      <Table
        props={{
          columns: keys.map((key) => ({ key, label: columnLabel(key) })),
          rows: rows.slice(0, MAX_CONNECTOR_ROWS_SHOWN).map((row) => Object.fromEntries(keys.map((key) => [key, cellOf(row[key])]))),
          nowrap: true,
        }}
      />
      {rows.length > MAX_CONNECTOR_ROWS_SHOWN ? <p className="text-[11px] text-muted-foreground">{TH.cards.connectorShown(MAX_CONNECTOR_ROWS_SHOWN, rows.length)}</p> : null}
    </>
  );
}

/** A connector tool's rows as a table: Thai labels over raw ids, masked fields named under the card. */
export function connectorCard(tool: string) {
  return function ConnectorCard({ result }: { result: unknown }) {
    const title = TH.cards.connectorTitle[tool] ?? tool;
    return (
      <ParsedCard parsed={parseResult(connectorResult, result)} title={title}>
        {({ summary, rows, provenance }) => {
          const masked = provenance.masked.length > 0 ? TH.cards.connectorMasked(provenance.masked.map(columnLabel).join(", ")) : null;
          return (
            <Card props={{ title, meta: summary, description: masked, footnote: TH.cards.source.connector(provenance.sourceSystem, formatDateTh(provenance.asOf)) }}>
              <ConnectorTable rows={rows} />
            </Card>
          );
        }}
      </ParsedCard>
    );
  };
}
