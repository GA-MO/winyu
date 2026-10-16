import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { recordMatterEvent } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { holdingHop, type Matter } from "@/lib/share/matter";
import { allowedActions, transition, type MatterAction, type MatterBrief, type MatterRefusal, type Telling } from "@/lib/share/matter-actions";
import { mayOpen, shares } from "./shares";
import { cardOwner, suggestionsFor } from "./suggest";

/** A press as a person sends it: not_mine names nobody, the server looks up the card's owner. */
export type MatterPress = Exclude<MatterAction, { kind: "not_mine" }> | { kind: "not_mine" };

/** What a press did: the stored matter, or why nothing changed (not_found also when the person is not on its path, so a code tells a stranger nothing). */
export type MatterOutcome = { ok: true; matter: Matter } | { ok: false; refusal: MatterRefusal | "not_found" };

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function actionOf(press: MatterPress, matter: Matter): MatterAction {
  return press.kind === "not_mine" ? { kind: "not_mine", ownerId: cardOwner(matter.card)?.userId ?? null } : press;
}

function tell(telling: Telling, matter: Matter, actor: User, at: Date): void {
  if (telling.handed) {
    notify(telling.userId, actor.id, { kind: "matter", refId: matter.id, senderName: actor.nameTh, ask: matter.ask }, at);
    return;
  }
  notify(telling.userId, actor.id, { kind: "matter_update", refId: matter.id, actorName: actor.nameTh, cardTitle: matter.title, change: telling.change, text: telling.text }, at);
}

function refused(actor: User, code: string, press: MatterPress, refusal: MatterRefusal): MatterOutcome {
  recordMatterEvent({ userId: actor.id, code, action: press.kind, toUserId: press.kind === "pass_on" ? press.toUserId : null, refusal });
  return { ok: false, refusal };
}

/** Applies one press to a matter as this person: refused unless the table allows it, else stored, audited once, and each person it concerns told once. No model call. */
export function actOnMatter(actor: User, code: string, press: MatterPress, at = new Date()): MatterOutcome {
  const matter = shares().get(code);
  if (!matter || !mayOpen(matter, actor)) return { ok: false, refusal: "not_found" };
  if (press.kind === "pass_on" && !findUser(press.toUserId)) return refused(actor, code, press, "bad_target");
  const result = transition(matter, actor.id, actionOf(press, matter), at.toISOString());
  if (!result.ok) return refused(actor, code, press, result.refusal);
  const stored = shares().put(result.matter);
  recordMatterEvent({ userId: actor.id, code, action: press.kind, toUserId: stored.thread.at(-1)?.toUserId ?? null, refusal: null });
  for (const telling of result.tell) tell(telling, stored, actor, at);
  return { ok: true, matter: stored };
}

/** A matter as one viewer's bell, Inbox and page show it: names, the ask, who handed it on when that was not the sender, and what the viewer may press. */
export function briefOf(matter: Matter, viewerId: string): MatterBrief {
  const hop = holdingHop(matter);
  const passer = hop?.fromUserId ?? null;
  return {
    code: matter.id,
    title: matter.title,
    ask: matter.ask,
    senderName: nameOf(matter.senderId),
    passerName: passer && passer !== matter.senderId ? nameOf(passer) : null,
    at: hop?.at ?? matter.at,
    actions: allowedActions(matter, viewerId),
    suggested: suggestionsFor(matter.card, viewerId),
  };
}
