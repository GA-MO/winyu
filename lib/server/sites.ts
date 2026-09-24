import type { AccessContext, Incident, Site } from "@/lib/contracts";
import { TODAY, addDays } from "@/lib/data/dates";
import { RECENT_LTI_DAYS, SAFE_STREAK_DAYS, safetyOf, type SafetyStatus, type SiteSafety } from "@/lib/engine/site-safety";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { peopleAtSite, type PersonBadge } from "./people";
import { ports } from "./ports";
import { directoryOf } from "./ports/directory";
import type { SiteRecords } from "./ports/sites";

const T = TH.sites;
const MAX_TIMELINE = 8;
const TIMELINE_DAYS = 365;

type Tone = "good" | "bad" | "neutral";

const STATUS_ORDER: Record<SafetyStatus, number> = { alarm: 0, watch: 1, clear: 2 };

function streakTone(safety: SiteSafety): Tone {
  if (safety.daysSinceLti === null || safety.daysSinceLti >= SAFE_STREAK_DAYS) return "good";
  return safety.daysSinceLti < RECENT_LTI_DAYS ? "bad" : "neutral";
}

function streakValue(safety: SiteSafety): string {
  return safety.daysSinceLti === null ? T.noLti : T.streakValue(safety.daysSinceLti);
}

function badgesOf(site: Site, safety: SiteSafety): PersonBadge[] {
  const badges: PersonBadge[] = [];
  if (safety.open.length > 0) badges.push({ label: T.badge.open(safety.open.length), tone: "danger" });
  if (safety.recent.length > safety.previous.length) badges.push({ label: T.badge.rising, tone: "warning" });
  if (safety.highOvertime) badges.push({ label: T.badge.overtime(site.overtimeHoursPerHead3m), tone: "warning" });
  if (badges.length === 0 && safety.status === "clear") badges.push({ label: T.badge.clear, tone: "success" });
  return badges;
}

function rankedRow(site: Site, incidents: readonly Incident[]) {
  const safety = safetyOf(site, incidents);
  return { order: STATUS_ORDER[safety.status], streak: safety.daysSinceLti ?? Number.MAX_SAFE_INTEGER, row: rowOf(site, safety) };
}

function rowOf(site: Site, safety: SiteSafety) {
  return {
    id: site.id,
    name: site.nameTh,
    kind: T.kind[site.kind] ?? site.kind,
    place: site.placeTh,
    photo: site.photo,
    status: T.status[safety.status],
    trailing: { text: safety.daysSinceLti === null ? T.noLtiShort : T.streakShort(safety.daysSinceLti), tone: streakTone(safety) },
    note: T.note(safety.recent.length, safety.recentLti),
    badges: badgesOf(site, safety),
  };
}

function lastYearOf(site: Site, incidents: readonly Incident[]): Incident[] {
  const since = addDays(TODAY, -TIMELINE_DAYS);
  return incidents.filter((incident) => incident.siteId === site.id && incident.date >= since && incident.date <= TODAY);
}

function timelineOf(incidents: Incident[]) {
  return [...incidents]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, MAX_TIMELINE)
    .map((incident) => ({
      title: T.eventTitle(T.incident[incident.kind] ?? incident.kind, incident.titleTh),
      detail: T.eventDetail(incident.detailTh, incident.actionTh, incident.closed),
      time: formatDateTh(incident.date),
    }));
}

function metricsOf(site: Site, safety: SiteSafety) {
  const rising = safety.recent.length > safety.previous.length;
  return [
    { label: T.streakLabel, value: streakValue(safety), detail: null, tone: streakTone(safety) },
    { label: T.recentLabel, value: T.recentValue(safety.recent.length), detail: T.recentDetail(safety.previous.length), tone: (rising ? "bad" : "neutral") as Tone },
    { label: T.overtimeLabel, value: T.overtimeValue(site.overtimeHoursPerHead3m), detail: null, tone: (safety.highOvertime ? "bad" : "neutral") as Tone },
  ];
}

function resolveSite(records: SiteRecords, id: string | null, name: string | null): Site | null {
  const byId = id ? records.sites.find((site) => site.id === id) ?? null : null;
  if (byId) return byId;
  const needle = (name ?? id ?? "").replace(/^(โรงงาน|ศูนย์กระจายสินค้า|สำนักงาน)/, "").trim();
  if (needle.length === 0) return null;
  return records.sites.find((site) => site.nameTh.includes(needle)) ?? null;
}

/** Every site, the ones that need attention first, each with its streak since the last lost-time injury. */
function listSites(records: SiteRecords) {
  const ranked = records.sites.map((site) => rankedRow(site, records.incidents)).sort((left, right) => left.order - right.order || left.streak - right.streak);
  const alarms = ranked.filter((entry) => entry.order === STATUS_ORDER.alarm).length;
  return { ok: true as const, summary: T.summary(ranked.length, alarms), data: ranked.map((entry) => entry.row) };
}

/** One site's safety picture: photo, three numbers that decide, the incident timeline, open corrective actions and the people on site the viewer may see. */
export async function siteDetail(access: AccessContext, id: string | null, name: string | null) {
  const records = await ports().sites.load();
  if (!id && !name) return listSites(records);
  const site = resolveSite(records, id, name);
  if (!site) return { ok: false as const, error: T.notFound(name ?? id ?? "") };
  const directory = directoryOf(await ports().directory.load());
  const safety = safetyOf(site, records.incidents);
  const lead = site.safetyLeadId ? directory.byId(site.safetyLeadId) : null;
  return {
    ok: true as const,
    summary: T.detailSummary(site.nameTh, T.status[safety.status] ?? safety.status),
    data: {
      id: site.id,
      name: site.nameTh,
      photo: site.photo,
      badges: badgesOf(site, safety),
      metrics: metricsOf(site, safety),
      facts: [
        { label: T.fact.kind, value: T.kind[site.kind] ?? site.kind },
        { label: T.fact.place, value: site.placeTh },
        { label: T.fact.headcount, value: T.headcountValue(site.headcount) },
        ...(lead ? [{ label: T.fact.safetyLead, value: lead.nameTh }] : []),
      ],
      open_actions: safety.open.map((incident) => ({ title: incident.titleTh, body: incident.actionTh, date: formatDateTh(incident.date) })),
      incidents: timelineOf(lastYearOf(site, records.incidents)),
      people: peopleAtSite(access, site.id, directory),
    },
  };
}
