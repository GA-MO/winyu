"use client";

import { Callout, Card, Image, KeyValue, Timeline } from "@/components/ui/primitives";
import { TH } from "@/lib/i18n/th";
import { AskRow, ParsedCard, RowGrid, SectionTitle, StatRow } from "./frame";
import { parseResult, siteResult, sitesResult } from "./shapes";

function SitesOverview({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(sitesResult, result)} title={TH.cards.sitesAll}>
      {({ summary, data }) => {
        const first = data[0];
        return (
          <Card props={{ title: first ? TH.cards.sitesFirst(first.name) : TH.cards.sitesAll, meta: summary, footnote: TH.cards.source.she }}>
            <RowGrid>
              {data.map((site) => (
                <AskRow
                  key={site.id}
                  prompt={TH.cards.askSite(site.name)}
                  title={site.name}
                  subtitle={`${site.kind} · ${site.place}`}
                  detail={site.note}
                  src={site.photo}
                  media="thumb"
                  badges={site.badges}
                  trailing={site.trailing.text}
                  trailingTone={site.trailing.tone}
                />
              ))}
            </RowGrid>
          </Card>
        );
      }}
    </ParsedCard>
  );
}

function SiteDetail({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(siteResult, result)} title={TH.cards.sitesAll}>
      {({ summary, data }) => (
        <Card props={{ title: TH.cards.siteTitle(data.name), meta: summary, footnote: TH.cards.source.she }}>
          {data.photo ? <Image props={{ src: data.photo, alt: data.name, aspect: "banner" }} /> : null}
          <StatRow stats={data.metrics} />
          {data.open_actions.map((action) => (
            <Callout key={action.title} props={{ eyebrow: TH.cards.openAction(action.date), title: action.title, body: action.body, tone: "danger" }} />
          ))}
          <KeyValue props={{ pairs: data.facts }} />
          {data.incidents.length > 0 ? (
            <>
              <SectionTitle>{TH.cards.incidents}</SectionTitle>
              <Timeline props={{ items: data.incidents }} />
            </>
          ) : null}
          {data.people.length > 0 ? (
            <>
              <SectionTitle>{TH.cards.sitePeople}</SectionTitle>
              <RowGrid>
                {data.people.map((person) => (
                  <AskRow
                    key={person.id}
                    prompt={TH.cards.askProfile(person.name)}
                    title={person.name}
                    subtitle={person.title}
                    detail={person.tenure}
                    src={person.photo}
                    media="avatar"
                    badges={person.badges}
                  />
                ))}
              </RowGrid>
            </>
          ) : null}
        </Card>
      )}
    </ParsedCard>
  );
}

function isOverview(result: unknown): boolean {
  return typeof result === "object" && result !== null && Array.isArray((result as { data?: unknown }).data);
}

/** get_site: every site as a pressable row when none was named, one site's safety in full when it was. */
export function SiteCard({ result }: { result: unknown }) {
  return isOverview(result) ? <SitesOverview result={result} /> : <SiteDetail result={result} />;
}
