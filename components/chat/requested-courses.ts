import type { ComposedSurface } from "@/lib/compose/catalog";
import { TH } from "@/lib/i18n/th";
import type { Exchange } from "./timeline";

const ENROLL_TOOL = "enroll_course";
const REQUESTED_BADGE = { label: TH.courses.badge.requested, tone: "success" } as const;

type Badge = { label?: unknown };

function courseIdOf(args: unknown): string | null {
  const courseId = typeof args === "object" && args !== null ? (args as { courseId?: unknown }).courseId : null;
  return typeof courseId === "string" ? courseId : null;
}

function isRequested(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === true;
}

/** The courses this conversation asked a seat on: every enroll_course call whose approved receipt came back ok. */
export function requestedCoursesOf(exchanges: readonly Exchange[]): ReadonlySet<string> {
  const requested = new Set<string>();
  for (const step of exchanges.flatMap((exchange) => exchange.steps)) {
    if (step.kind !== "tool" || step.name !== ENROLL_TOOL || step.outcome.state !== "returned" || !isRequested(step.outcome.result)) continue;
    const courseId = courseIdOf(step.args);
    if (courseId) requested.add(courseId);
  }
  return requested;
}

function offersEnroll(surface: ComposedSurface): boolean {
  return JSON.stringify(surface.components).includes(`"name":"${ENROLL_TOOL}"`);
}

function withBadge(value: unknown, requested: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => withBadge(item, requested));
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value).map(([key, item]) => [key, withBadge(item, requested)] as const);
  const row = Object.fromEntries(entries) as { id?: unknown; badges?: unknown };
  if (typeof row.id !== "string" || !requested.has(row.id) || !Array.isArray(row.badges)) return row;
  if ((row.badges as Badge[]).some((badge) => badge?.label === REQUESTED_BADGE.label)) return row;
  return { ...row, badges: [REQUESTED_BADGE, ...row.badges] };
}

/** A composed course card brought up to date with the seats this conversation has since requested: each course row that carries badges gets the same "requested" badge list_courses would give it; seat counts are left as the card was drawn, never recomputed here. */
export function withRequestedCourses(surface: ComposedSurface, requested: ReadonlySet<string>): ComposedSurface {
  if (requested.size === 0 || !offersEnroll(surface)) return surface;
  return { ...surface, dataModel: withBadge(surface.dataModel, requested) as Record<string, unknown> };
}
