"use client";

import { Avatar, Badge, Callout, Card, KeyValue, Timeline } from "@/components/ui/primitives";
import { TH } from "@/lib/i18n/th";
import { askAction, useRunAction } from "../card-actions";
import { AskRow, ParsedCard, RowGrid, SectionTitle } from "./frame";
import { parseResult, peopleResult, personResult, ownerResult } from "./shapes";
import type { z } from "zod";

type PersonRow = z.infer<typeof peopleResult>["data"][number];

const ALARM_TONES = new Set(["danger", "warning"]);

function alarmsOf(row: PersonRow): number {
  return row.badges.filter((badge) => badge.tone && ALARM_TONES.has(badge.tone)).length;
}

function detailOf(row: PersonRow): string {
  return [row.place, row.tenure].filter(Boolean).join(" · ");
}

function PersonRowItem({ row }: { row: PersonRow }) {
  const title = row.is_you ? `${row.name} (${TH.cards.you})` : row.name;
  return (
    <AskRow
      prompt={TH.cards.askProfile(row.name)}
      title={title}
      subtitle={row.title}
      detail={detailOf(row)}
      src={row.photo}
      media="avatar"
      badges={row.badges}
    />
  );
}

/** find_people: everyone in scope as pressable rows, the ones carrying a warning first, then the seats still empty. */
export function PeopleCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(peopleResult, result)} title={TH.cards.team}>
      {({ summary, data, open_positions: open }) => {
        const rows = [...data].sort((left, right) => alarmsOf(right) - alarmsOf(left));
        return (
          <Card props={{ title: TH.cards.team, meta: summary, footnote: TH.cards.source.hris }}>
            <RowGrid>
              {rows.map((row) => (
                <PersonRowItem key={row.id} row={row} />
              ))}
            </RowGrid>
            {open.length > 0 ? (
              <Callout
                props={{
                  eyebrow: TH.cards.openPositions.eyebrow,
                  title: TH.cards.openPositions.title(open.length),
                  body: open.map((position) => `${position.title} (${position.open_label})`).join(" · "),
                  tone: "warning",
                }}
              />
            ) : null}
          </Card>
        );
      }}
    </ParsedCard>
  );
}

/** get_person: who they are, what needs attention, the facts, then the career and the team on demand. */
export function PersonCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(personResult, result)} title={TH.cards.notFoundPerson}>
      {({ data }) => (
        <Card props={{ title: TH.cards.profileTitle(data.name), footnote: TH.cards.source.hris }}>
          <div className="flex flex-col gap-2">
            <Avatar props={{ name: data.name, role: data.title, src: data.photo, size: "lg" }} />
            {data.badges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {data.badges.map((badge) => (
                  <Badge key={badge.label} props={{ label: badge.label, tone: badge.tone }} />
                ))}
              </div>
            ) : null}
          </div>
          {data.risk_reasons.length > 0 ? (
            <Callout props={{ eyebrow: TH.cards.risk.eyebrow, title: TH.cards.risk.title, body: data.risk_reasons.join(" · "), tone: "danger" }} />
          ) : null}
          <KeyValue props={{ pairs: data.facts }} />
          {data.certificates.length > 0 ? (
            <>
              <SectionTitle>{TH.cards.certificates}</SectionTitle>
              <KeyValue props={{ pairs: data.certificates }} />
            </>
          ) : null}
          {data.history.length > 0 ? (
            <>
              <SectionTitle>{TH.cards.career}</SectionTitle>
              <Timeline props={{ items: data.history }} />
            </>
          ) : null}
          {data.reports.length > 0 ? (
            <>
              <SectionTitle>{TH.cards.reports}</SectionTitle>
              <RowGrid>
                {data.reports.map((report) => (
                  <AskRow key={report.id} prompt={TH.cards.askProfile(report.name)} title={report.name} subtitle={report.title} src={report.photo} media="avatar" />
                ))}
              </RowGrid>
            </>
          ) : null}
        </Card>
      )}
    </ParsedCard>
  );
}

function OwnerAsk({ name }: { name: string }) {
  const run = useRunAction();
  return (
    <button
      type="button"
      onClick={() => run(askAction(TH.cards.owner.ask(name)))}
      className="inline-flex self-start rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {TH.cards.owner.askLabel}
      {name}
    </button>
  );
}

/** resolve_owner: the one person to hand this to, why them, and how loaded they are. */
export function OwnerCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(ownerResult, result)} title={TH.cards.refused}>
      {({ data }) => (
        <Card props={{ title: TH.cards.owner.title(data.nameTh), description: data.reason, footnote: TH.cards.source.routing }}>
          <Avatar props={{ name: data.nameTh, role: data.title, size: "md" }} />
          <OwnerAsk name={data.nameTh} />
        </Card>
      )}
    </ParsedCard>
  );
}
