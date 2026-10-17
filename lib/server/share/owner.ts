import type { MetricId, Region, User } from "@/lib/contracts";
import { managerOf, responsibleFor } from "@/lib/access/raci";
import { agentById } from "@/lib/data/entities/agents";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { holdingHop, type Matter } from "@/lib/share/matter";
import { shares } from "./shares";
import { cardSubject } from "./suggest";

/** Who should get work on a metric: the user id, name and title, why them, how much they hold open now and how many such matters they took before. */
export type OwnerSuggestion = { userId: string; nameTh: string; title: string; reason: string; openLoad: number; handledBefore: number };

const MIN_USUAL_SENDS = 2;

function isAbout(matter: Matter, metric: MetricId, region: Region | null): boolean {
  const subject = cardSubject(matter.card);
  return subject.metric === metric && subject.region === region;
}

function takersOf(matter: Matter): string[] {
  return matter.path.filter((hop) => hop.state === "accepted").map((hop) => hop.userId);
}

function takersFrom(matter: Matter, fromUserId: string): string[] {
  return matter.path.filter((hop) => hop.state === "accepted" && hop.fromUserId === fromUserId).map((hop) => hop.userId);
}

/** The colleague who took matters on this metric and region straight from this sender at least twice (accepted them, not only received them); someone who took one after another person passed it on is that person's recipient, not this sender's. */
export function usualRecipient(fromUserId: string, metric: MetricId, region: Region | null): { userId: string; sent: number } | null {
  const counts = new Map<string, number>();
  for (const matter of shares().where((entry) => entry.senderId === fromUserId && entry.intent === "act" && isAbout(entry, metric, region))) {
    for (const taker of takersFrom(matter, fromUserId)) counts.set(taker, (counts.get(taker) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return best && best[1] >= MIN_USUAL_SENDS ? { userId: best[0], sent: best[1] } : null;
}

type Candidate = { user: User; basis: string };

/** Whom a lookup may answer, in order: whom this user usually sends it to, the RACI owner, then, since the asker is never the answer (AI-310), the rep who owns the one agent asked about and the asker's own manager. */
function candidatesFor(metric: MetricId, region: Region | null, fromUserId: string | null, agentId: string | null): Candidate[] {
  const usual = fromUserId ? usualRecipient(fromUserId, metric, region) : null;
  const usualUser = usual ? findUser(usual.userId) : null;
  const raci = responsibleFor(metric, region, agentId);
  const rep = agentId ? findUser(agentById(agentId)?.ownerId ?? "") : null;
  const manager = fromUserId ? managerOf(fromUserId) : null;
  return [
    ...(usual && usualUser ? [{ user: usualUser, basis: TH.owner.usualReason(usual.sent, usualUser.nameTh) }] : []),
    ...(raci ? [{ user: raci.user, basis: raci.basis }] : []),
    ...(rep ? [{ user: rep, basis: TH.owner.agentRep }] : []),
    ...(manager ? [{ user: manager, basis: TH.owner.askerManager }] : []),
  ];
}

/** Who should get this: whom this user usually sends it to, else the RACI owner, never the person asking (the agent's rep, else their manager, when they own it themselves); with how many such matters they took before and how many they hold open now. */
export function suggestOwner(metric: MetricId, region: Region | null, fromUserId: string | null = null, agentId: string | null = null): OwnerSuggestion | null {
  const chosen = candidatesFor(metric, region, fromUserId, agentId).find((candidate) => candidate.user.id !== fromUserId);
  if (!chosen) return null;
  const target = chosen.user;
  const all = shares().all();
  const handledBefore = all.filter((matter) => takersOf(matter).includes(target.id) && cardSubject(matter.card).metric === metric).length;
  const openLoad = all.filter((matter) => matter.status === "open" && matter.intent === "act" && holdingHop(matter)?.userId === target.id).length;
  return { userId: target.id, nameTh: target.nameTh, title: target.title, reason: TH.owner.reason(chosen.basis, handledBefore, openLoad), openLoad, handledBefore };
}
