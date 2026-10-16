import type { MetricId, Region } from "@/lib/contracts";
import { responsibleFor } from "@/lib/access/raci";
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

/** The colleague who took matters on this metric and region from this sender at least twice (accepted them, not only received them). */
export function usualRecipient(fromUserId: string, metric: MetricId, region: Region | null): { userId: string; sent: number } | null {
  const counts = new Map<string, number>();
  for (const matter of shares().where((entry) => entry.senderId === fromUserId && entry.intent === "act" && isAbout(entry, metric, region))) {
    for (const taker of takersOf(matter)) counts.set(taker, (counts.get(taker) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return best && best[1] >= MIN_USUAL_SENDS ? { userId: best[0], sent: best[1] } : null;
}

/** Who should get this: whom this user usually sends it to, else the RACI owner; with how many such matters they took before and how many they hold open now. */
export function suggestOwner(metric: MetricId, region: Region | null, fromUserId: string | null = null, agentId: string | null = null): OwnerSuggestion | null {
  const raci = responsibleFor(metric, region, agentId);
  const usual = fromUserId ? usualRecipient(fromUserId, metric, region) : null;
  const usualUser = usual ? findUser(usual.userId) : null;
  const target = usualUser ?? raci?.user ?? null;
  if (!target) return null;
  const all = shares().all();
  const handledBefore = all.filter((matter) => takersOf(matter).includes(target.id) && cardSubject(matter.card).metric === metric).length;
  const openLoad = all.filter((matter) => matter.status === "open" && matter.intent === "act" && holdingHop(matter)?.userId === target.id).length;
  const basis = usual && usualUser ? TH.owner.usualReason(usual.sent, usualUser.nameTh) : (raci?.basis ?? "");
  return { userId: target.id, nameTh: target.nameTh, title: target.title, reason: TH.owner.reason(basis, handledBefore, openLoad), openLoad, handledBefore };
}
