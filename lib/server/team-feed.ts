import type { Spec } from "vexa/protocol";
import type { AccessContext, Alert, FeedItem, FeedTone, NextAction } from "@/lib/contracts";
import type { AmbientCard } from "@/lib/dashboard/ambient";
import { TODAY, toDayIndex } from "@/lib/data/dates";
import { agentById } from "@/lib/data/entities/agents";
import { provinceById } from "@/lib/data/entities/org";
import { findUser } from "@/lib/data/entities/users";
import { feedIntentKey } from "@/lib/engine/feed-learning";
import { TH } from "@/lib/i18n/th";
import { actionEvents, alerts, packets } from "@/lib/server/agent/collections";
import { alertIntentKey } from "@/lib/server/alerts";
import type { Directory } from "@/lib/server/ports/directory";

const MIN_MATTERS = 2;
const DAY_MS = 86_400_000;
const SALES_DEPARTMENT = "dept_sales";
const CAPTION_MATTERS = 3;
const OPENING_EVENTS: ReadonlySet<string> = new Set(["alert_open", "feed_open", "feed_done"]);
const TONE_ORDER: readonly FeedTone[] = ["danger", "warning", "brand", "info", "success", "neutral"];
const OPENING_PREFIX = "opening:";

/** A direct report's matters on a manager's feed, told as one: what is wrong, where no one is selling, and whether the report has picked it up. */
export type TeamStory = { item: FeedItem; card: AmbientCard; memberKeys: string[] };

type Member = { item: FeedItem; alert: Alert | null; provinceId: string | null; region: string | null; owner: string };

/** The viewer's direct report whose line a person is in, or null when the person is outside the viewer's line or is the viewer. */
function reportOn(viewerId: string, personId: string, directory: Directory): string | null {
  let current: string | null = personId;
  while (current && current !== viewerId) {
    const manager: string | null = directory.byId(current)?.managerId ?? null;
    if (manager === viewerId) return current;
    current = manager;
  }
  return null;
}

function memberOf(item: FeedItem, directory: Directory): { member: Member; responsible: string } | null {
  if (item.alertId) {
    const alert = alerts().get(item.alertId);
    if (!alert) return null;
    const provinceId = alert.dims.province ?? (alert.dims.agent ? agentById(alert.dims.agent)?.provinceId ?? null : null);
    return { member: { item, alert, provinceId, region: alert.dims.region ?? null, owner: alert.ownerUserId }, responsible: alert.ownerUserId };
  }
  if (item.source === "opening") {
    const position = directory.openPositions.find((entry) => item.key === `${OPENING_PREFIX}${entry.id}`);
    return position ? { member: { item, alert: null, provinceId: position.provinceId, region: position.region, owner: position.managerId }, responsible: position.managerId } : null;
  }
  return null;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, toDayIndex(toIso.slice(0, 10)) - toDayIndex(fromIso.slice(0, 10)));
}

/** Provinces where something went wrong and no sales rep is in post, with how long the seat has been empty. */
function uncoveredProvinces(members: readonly Member[], directory: Directory): { name: string; days: number }[] {
  const troubled = new Set(members.filter((member) => member.alert).flatMap((member) => member.provinceId ?? []));
  return directory.openPositions.flatMap((position) => {
    const province = position.provinceId;
    if (position.departmentId !== SALES_DEPARTMENT || !province || !troubled.has(province)) return [];
    return [{ name: provinceById(province)?.nameTh ?? province, days: daysBetween(position.openedOn, TODAY) }];
  })
    .sort((left, right) => right.days - left.days);
}

/** The one person the alerts belong to, when they all belong to one; that is whose handling the manager wants to know. */
function soleOwner(members: readonly Member[]): string | null {
  const owners = new Set(members.flatMap((member) => (member.alert ? [member.owner] : [])));
  return owners.size === 1 ? [...owners][0] ?? null : null;
}

/** The region the matters are in, when they share one. */
function sharedRegion(members: readonly Member[]): string | null {
  const regions = new Set(members.map((member) => member.region));
  const [only] = regions;
  return regions.size === 1 && only ? (TH.region as Record<string, string>)[only] ?? null : null;
}

/** Whether the person holding the matters has picked them up: handed them on, opened them, or left them. */
function handlingOf(holderId: string, members: readonly Member[], now: number): string {
  const name = findUser(holderId)?.nameTh ?? holderId;
  const alertList = members.flatMap((member) => member.alert ?? []);
  const ids = new Set(alertList.map((alert) => alert.id));
  const handed = packets().all().find((packet) => packet.fromUserId === holderId && packet.alertIds.some((id) => ids.has(id)));
  if (handed) return TH.team.handedOff(name, findUser(handed.toUserId)?.nameTh ?? handed.toUserId);
  const intents = new Set(alertList.flatMap((alert) => [alertIntentKey(alert), feedIntentKey(`alert:${alert.metric}`, `alert:${alert.id}`)]));
  const lastOpen = actionEvents()
    .where((event) => event.userId === holderId && OPENING_EVENTS.has(event.kind) && intents.has(event.intentKey))
    .reduce<string | null>((latest, event) => (latest === null || event.at > latest ? event.at : latest), null);
  const today = new Date(now).toISOString();
  if (lastOpen) return TH.team.opened(name, daysBetween(lastOpen, today));
  const first = alertList.reduce<string | null>((earliest, alert) => (earliest === null || alert.at < earliest ? alert.at : earliest), null);
  return first ? TH.team.unopened(name, daysBetween(first, today)) : TH.team.openingsOnly(name);
}

function worstTone(members: readonly Member[]): FeedTone {
  return TONE_ORDER.find((tone) => members.some((member) => member.item.tone === tone)) ?? "neutral";
}

function askProgress(reportId: string, region: string, members: readonly Member[]): NextAction | null {
  const report = findUser(reportId);
  if (!report) return null;
  return {
    id: `team-ask-${reportId}`,
    kind: "handoff",
    label: TH.team.ask(report.nameTh),
    reason: TH.team.askReason,
    tool: "create_handoff",
    input: {
      toUserId: reportId,
      title: TH.team.askTitle(region),
      ask: TH.team.askText(members.map((member) => `${member.item.label} ${member.item.reason}`)),
      urgency: members.some((member) => member.item.tone === "danger") ? "high" : "medium",
      evidence: [],
      alertIds: members.flatMap((member) => member.alert?.id ?? []),
    },
    prompt: null,
  };
}

function storyOf(reportId: string, members: Member[], directory: Directory, now: number): TeamStory {
  const report = findUser(reportId);
  const name = report?.nameTh ?? reportId;
  const region = sharedRegion(members) ?? (report?.region ? TH.region[report.region] : TH.team.team);
  const tone = worstTone(members);
  const uncovered = uncoveredProvinces(members, directory);
  const handling = handlingOf(soleOwner(members) ?? reportId, members, now);
  const coverage = uncovered.length > 0 ? TH.team.uncovered(uncovered.map((entry) => TH.team.emptySeat(entry.name, entry.days))) : null;
  const action = askProgress(reportId, region, members);
  const memberKeys = members.map((member) => member.item.key).sort();
  const key = `team:${reportId}:${memberKeys.join(",")}`;
  const label = TH.team.label(region, name);
  const reason = TH.team.count(members.length);
  const prompt = TH.team.prompt(region, name);
  const root = `ambient-team-${reportId}`;
  const caption = members.slice(0, CAPTION_MATTERS).map((member) => `${member.item.label.split(" · ")[0]} ${member.item.reason}`).join(" · ");
  const item: FeedItem = {
    key,
    source: "team",
    kind: "team",
    story: null,
    rank: Math.max(...members.map((member) => member.item.rank)) + 1,
    tone,
    label,
    reason,
    detail: [coverage, handling].filter(Boolean).join(" · "),
    prompt,
    alertId: null,
    packetId: null,
    canFinish: true,
    actions: action ? [action] : [],
    because: null,
  };
  const card: AmbientCard = {
    id: root,
    eyebrow: TH.team.eyebrow(tone === "danger" ? TH.severity.P1 : TH.severity.P2),
    tone: tone === "danger" ? "danger" : "warning",
    title: label,
    headline: { value: reason, tone: tone === "danger" ? "danger" : "warning", caption },
    body: coverage,
    lesson: handling,
    prompt,
    packetId: null,
    alertId: null,
    feedKey: key,
    handoff: action,
    spec: { root, elements: { [root]: { type: "Callout", props: { eyebrow: TH.team.eyebrow(""), title: label, body: [coverage, handling].filter(Boolean).join(" · "), tone: "warning" }, children: [] } } } as unknown as Spec,
  };
  return { item, card, memberKeys };
}

/** A manager's feed with each direct report's two or more matters folded into one story; the rest of the feed is left as it was. */
export function withTeamStories(access: AccessContext, items: readonly FeedItem[], directory: Directory, now = Date.now()): { items: FeedItem[]; stories: TeamStory[] } {
  const groups = new Map<string, Member[]>();
  for (const item of items) {
    const found = memberOf(item, directory);
    if (!found || found.responsible === access.userId) continue;
    if (found.member.alert?.alsoOwnerIds?.includes(access.userId)) continue;
    const report = reportOn(access.userId, found.responsible, directory);
    if (report) groups.set(report, [...(groups.get(report) ?? []), found.member]);
  }
  const stories = [...groups].filter(([, members]) => members.length >= MIN_MATTERS).map(([report, members]) => storyOf(report, members, directory, now));
  const folded = new Set(stories.flatMap((story) => story.memberKeys));
  const rest = items.filter((item) => !folded.has(item.key));
  return { items: [...stories.map((story) => story.item), ...rest].sort((left, right) => right.rank - left.rank), stories };
}
