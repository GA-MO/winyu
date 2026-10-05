"use client";

import { Badge, Card, KeyValue, ListItem } from "@/components/ui/primitives";
import { Carousel } from "@/components/ui/carousel";
import { TH } from "@/lib/i18n/th";
import { useRunAction } from "../card-actions";
import { LeaveForm } from "../leave-form";
import { ParsedCard, RowGrid, SectionTitle, StatRow } from "./frame";
import { candidatesResult, coursesResult, parseResult, policyResult } from "./shapes";
import type { z } from "zod";

type Course = z.infer<typeof coursesResult>["data"][number];

const ENROLL =
  "inline-flex self-start rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** list_candidates: the three numbers that decide, every candidate side by side, the open seats. */
export function CandidatesCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(candidatesResult, result)} title={TH.cards.noCandidates}>
      {({ summary, data }) => {
        const leader = data.candidates[0];
        return (
          <Card props={{ title: leader ? TH.cards.candidatesLead(leader.name, leader.stage) : TH.cards.noCandidates, meta: summary, footnote: TH.cards.source.ats }}>
            <StatRow stats={data.metrics} />
            <RowGrid>
              {data.candidates.map((candidate) => (
                <ListItem
                  key={candidate.id}
                  props={{
                    title: candidate.name,
                    subtitle: `${candidate.stage} · ${candidate.position}`,
                    detail: [candidate.experience, candidate.strength, candidate.concern].filter(Boolean).join(" · "),
                    media: "avatar",
                    badges: candidate.badges,
                    trailing: candidate.score_label,
                  }}
                />
              ))}
            </RowGrid>
            {data.positions.length > 0 ? (
              <>
                <SectionTitle>{TH.cards.positions}</SectionTitle>
                <KeyValue props={{ pairs: data.positions.map((position) => ({ label: position.title, value: TH.cards.positionLine(position.candidates, position.advanced, position.open_label) })) }} />
              </>
            ) : null}
          </Card>
        );
      }}
    </ParsedCard>
  );
}

function urgentCourse(rows: Course[]): Course | null {
  return rows.find((row) => row.can_enroll && row.note !== null) ?? null;
}

function EnrollButton({ course }: { course: Course }) {
  const run = useRunAction();
  return (
    <button
      type="button"
      className={ENROLL}
      onClick={() => run({ id: `enroll-${course.id}`, kind: "form", label: TH.cards.enrollLabel(course.title), tool: "enroll_course", input: { courseId: course.id } })}
    >
      {TH.cards.enroll}
    </button>
  );
}

function CourseSlide({ course }: { course: Course }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {course.cover ? <img src={course.cover} alt={course.title} className="aspect-[16/9] w-full object-cover" /> : null}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-[11px] font-medium text-muted-foreground">{course.category}</p>
        <h4 className="text-sm font-semibold leading-snug text-foreground">{course.title}</h4>
        <p className="text-xs text-muted-foreground">{`${course.when} · ${course.place}`}</p>
        <div className="flex flex-wrap gap-1">
          <Badge props={{ label: course.seats.label, tone: course.seats.tone === "bad" ? "warning" : "neutral" }} />
          {course.badges.map((badge) => (
            <Badge key={badge.label} props={{ label: badge.label, tone: badge.tone }} />
          ))}
        </div>
        {course.note ? <p className="text-xs leading-relaxed text-foreground/85">{course.note}</p> : null}
        <div className="mt-auto pt-1">{course.can_enroll ? <EnrollButton course={course} /> : null}</div>
      </div>
    </article>
  );
}

/** list_courses: covers to choose from, the one to enrol in first leading, each with its own enrol button. */
export function CoursesCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(coursesResult, result)} title={TH.cards.coursesAll}>
      {({ summary, data }) => {
        const urgent = urgentCourse(data);
        const ordered = urgent ? [urgent, ...data.filter((row) => row.id !== urgent.id)] : data;
        return (
          <Card props={{ title: urgent ? TH.cards.coursesFirst(urgent.title) : TH.cards.coursesAll, meta: summary, footnote: TH.cards.source.lms }}>
            {ordered.length === 0 ? <p className="text-sm text-muted-foreground">{TH.cards.noCourses}</p> : null}
            <Carousel>
              {ordered.map((course) => (
                <CourseSlide key={course.id} course={course} />
              ))}
            </Carousel>
          </Card>
        );
      }}
    </ParsedCard>
  );
}

/** get_policy: the balance that decides first, the rules to open on demand, then the leave form. */
export function PolicyCard({ result }: { result: unknown }) {
  return (
    <ParsedCard parsed={parseResult(policyResult, result)} title={TH.cards.benefitsTitle}>
      {({ summary, data }) => {
        const first = data.balances[0];
        return (
          <Card props={{ title: first ? TH.cards.balanceTitle(first.label, first.value) : TH.cards.benefitsTitle, meta: summary, footnote: TH.cards.source.policy }}>
            <StatRow stats={data.balances} />
            <ul className="divide-y divide-border/60 rounded-xl border border-border">
              {data.sections.map((section) => (
                <li key={section.title}>
                  <details className="group">
                    <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-medium text-foreground [&::-webkit-details-marker]:hidden">{section.title}</summary>
                    <p className="px-3 pb-3 text-[13px] leading-relaxed text-muted-foreground">{section.content}</p>
                  </details>
                </li>
              ))}
            </ul>
            {data.form ? <LeaveForm props={{ kinds: data.form.kinds, earliest: data.form.earliest, approver: data.form.approver, note: data.form.note }} /> : null}
          </Card>
        );
      }}
    </ParsedCard>
  );
}
