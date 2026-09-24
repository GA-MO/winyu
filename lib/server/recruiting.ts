import type { AccessContext } from "@/lib/contracts";
import { canSeeCandidates, canSeeSalary } from "@/lib/access/people-scope";
import { OPEN_POSITIONS, employeeById, type OpenPosition } from "@/lib/data/entities/people";
import { CANDIDATES, CANDIDATE_STAGES, candidatesOf, type Candidate, type CandidateStage } from "@/lib/data/entities/recruiting";
import { TODAY, toDayIndex } from "@/lib/data/dates";
import { formatCurrency, formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { PersonBadge } from "./people";

const T = TH.recruiting;
const MAX_CANDIDATE_ROWS = 12;
const SLOW_OPENING_DAYS = 45;
const INTERVIEW_STEP = CANDIDATE_STAGES.indexOf("interview");
const REFERRAL = "พนักงานแนะนำ";
const RECENT_DAYS = 7;
const PERCENT = 100;

type Tone = "good" | "bad" | "neutral";

export type CandidateQuery = { position: string | null; stage: CandidateStage | null };

function stepOf(stage: CandidateStage): number {
  return CANDIDATE_STAGES.indexOf(stage);
}

function daysOpen(position: OpenPosition): number {
  return toDayIndex(TODAY) - toDayIndex(position.openedOn);
}

function badgesOf(candidate: Candidate): PersonBadge[] {
  const badges: PersonBadge[] = [];
  if (candidate.stage === "offer") badges.push({ label: T.badge.offer, tone: "success" });
  if (candidate.concernTh) badges.push({ label: T.badge.concern, tone: "warning" });
  if (candidate.sourceTh.startsWith(REFERRAL)) badges.push({ label: T.badge.referral, tone: "neutral" });
  return badges;
}

function rowOf(access: AccessContext, candidate: Candidate) {
  const position = OPEN_POSITIONS.find((entry) => entry.id === candidate.positionId);
  return {
    id: candidate.id,
    name: candidate.nameTh,
    position: position?.title ?? candidate.positionId,
    stage: T.stage[candidate.stage],
    step: stepOf(candidate.stage) + 1,
    steps: CANDIDATE_STAGES.length,
    stage_percent: Math.round(((stepOf(candidate.stage) + 1) / CANDIDATE_STAGES.length) * PERCENT),
    score: candidate.score,
    score_label: candidate.score === null ? T.notScored : T.scoreLabel(candidate.score),
    applied: T.applied(formatDateTh(candidate.appliedOn)),
    experience: candidate.experienceTh,
    strength: candidate.strengthTh,
    concern: candidate.concernTh,
    source: candidate.sourceTh,
    badges: badgesOf(candidate),
    ...(canSeeSalary(access) ? { expected_salary: formatCurrency(candidate.expectedSalaryThb) } : {}),
  };
}

function furthestFirst(left: Candidate, right: Candidate): number {
  return stepOf(right.stage) - stepOf(left.stage) || (right.score ?? 0) - (left.score ?? 0) || left.appliedOn.localeCompare(right.appliedOn);
}

function visiblePositions(access: AccessContext): OpenPosition[] {
  return OPEN_POSITIONS.filter((position) => canSeeCandidates(access, position.managerId));
}

function positionSummary(position: OpenPosition) {
  const candidates = candidatesOf(position.id);
  const advanced = candidates.filter((candidate) => stepOf(candidate.stage) >= INTERVIEW_STEP).length;
  return {
    id: position.id,
    title: position.title,
    manager: employeeById(position.managerId)?.nameTh ?? null,
    candidates: T.count(candidates.length),
    advanced: T.advanced(advanced),
    open_label: T.openFor(daysOpen(position)),
  };
}

function metricsOf(positions: OpenPosition[]) {
  const candidates = CANDIDATES.filter((candidate) => positions.some((position) => position.id === candidate.positionId));
  const recent = candidates.filter((candidate) => toDayIndex(TODAY) - toDayIndex(candidate.appliedOn) <= RECENT_DAYS).length;
  const advanced = candidates.filter((candidate) => stepOf(candidate.stage) >= INTERVIEW_STEP).length;
  const offers = candidates.filter((candidate) => candidate.stage === "offer").length;
  const oldest = Math.max(...positions.map(daysOpen));
  return [
    { label: T.metric.total, value: T.count(candidates.length), detail: T.metric.recent(recent), tone: "neutral" as Tone },
    { label: T.metric.advanced, value: T.count(advanced), detail: T.metric.offers(offers), tone: (advanced === 0 ? "bad" : "neutral") as Tone },
    { label: positions.length === 1 ? T.metric.openFor : T.metric.oldest, value: T.days(oldest), detail: null, tone: (oldest > SLOW_OPENING_DAYS ? "bad" : "neutral") as Tone },
  ];
}

function compact(text: string): string {
  return text.replace(/[\s()]/g, "");
}

function positionMatches(position: OpenPosition, needle: string): boolean {
  if (position.id === needle) return true;
  const words = needle.replace(/ผู้สมัคร|ตำแหน่ง/g, " ").split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return false;
  return compact(position.title).includes(compact(words.join(""))) || words.every((word) => position.title.includes(word));
}

function resolvePositions(visible: OpenPosition[], position: string | null): OpenPosition[] {
  if (!position) return visible;
  return visible.filter((entry) => positionMatches(entry, position.trim()));
}

/** The candidates for the openings the viewer may see (HR, CEO, the hiring manager and above), furthest along first. */
export function listCandidates(access: AccessContext, query: CandidateQuery) {
  const visible = visiblePositions(access);
  if (visible.length === 0) return { ok: false as const, code: "PERMISSION_DENIED" as const, error: T.denied };
  const positions = resolvePositions(visible, query.position);
  if (positions.length === 0) return { ok: false as const, error: T.noPosition(query.position ?? ""), positions: visible.map(positionSummary) };
  const candidates = CANDIDATES.filter((candidate) => positions.some((position) => position.id === candidate.positionId))
    .filter((candidate) => !query.stage || candidate.stage === query.stage)
    .sort(furthestFirst);
  const single = positions.length === 1 ? positions[0] : null;
  return {
    ok: true as const,
    summary: single ? T.summary(single.title, candidates.length, daysOpen(single)) : T.summaryAll(positions.length, candidates.length),
    data: {
      position: single ? positionSummary(single) : null,
      metrics: metricsOf(positions),
      candidates: candidates.slice(0, MAX_CANDIDATE_ROWS).map((candidate) => rowOf(access, candidate)),
      positions: single ? [] : positions.map(positionSummary),
    },
  };
}
