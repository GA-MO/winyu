import { TODAY, toDayIndex } from "@/lib/data/dates";
import type { Incident, Site } from "@/lib/contracts";

export const RECENT_DAYS = 90;
export const RECENT_LTI_DAYS = 30;
export const SAFE_STREAK_DAYS = 180;
export const HIGH_OVERTIME_PER_HEAD = 60;

export type SafetyStatus = "alarm" | "watch" | "clear";
export type SiteSafety = {
  daysSinceLti: number | null;
  recent: Incident[];
  previous: Incident[];
  recentLti: number;
  recentNearMiss: number;
  open: Incident[];
  highOvertime: boolean;
  status: SafetyStatus;
};

function ageInDays(date: string, today: string): number {
  return toDayIndex(today) - toDayIndex(date);
}

function lastLti(site: Site, incidents: Incident[]): string | null {
  const logged = incidents.filter((incident) => incident.kind === "lti").map((incident) => incident.date).sort().at(-1);
  return logged ?? site.lastLtiBeforeLog;
}

function statusOf(daysSinceLti: number | null, open: number, recentCount: number, previousCount: number): SafetyStatus {
  if ((daysSinceLti !== null && daysSinceLti < RECENT_LTI_DAYS) || open > 0) return "alarm";
  if (recentCount > previousCount || (daysSinceLti !== null && daysSinceLti < SAFE_STREAK_DAYS)) return "watch";
  return "clear";
}

/** What a site's incident log says today: the streak since the last lost-time injury, the last 90 days against the 90 before, and what is still open. */
export function safetyOf(site: Site, log: readonly Incident[], today: string = TODAY): SiteSafety {
  const incidents = log.filter((incident) => incident.siteId === site.id && incident.date <= today);
  const recent = incidents.filter((incident) => ageInDays(incident.date, today) < RECENT_DAYS);
  const previous = incidents.filter((incident) => {
    const age = ageInDays(incident.date, today);
    return age >= RECENT_DAYS && age < RECENT_DAYS * 2;
  });
  const last = lastLti(site, incidents);
  const daysSinceLti = last ? ageInDays(last, today) : null;
  const open = incidents.filter((incident) => !incident.closed);
  return {
    daysSinceLti,
    recent,
    previous,
    recentLti: recent.filter((incident) => incident.kind === "lti").length,
    recentNearMiss: recent.filter((incident) => incident.kind === "near_miss").length,
    open,
    highOvertime: site.overtimeHoursPerHead3m >= HIGH_OVERTIME_PER_HEAD,
    status: statusOf(daysSinceLti, open.length, recent.length, previous.length),
  };
}
