import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { personaOf } from "@/lib/server/portraits";
import type { HopState, Matter, MatterEvent } from "@/lib/share/matter";

/** One person on the matter page's path: the sender first, then each hop in order, with where they stand and since when. */
export type PathStep = { key: string; name: string; title: string; photo: string | null; state: HopState | "sender"; at: string };

/** One line of the thread as the page prints it: who did what, and the words they wrote. */
export type ThreadLine = { key: string; line: string; text: string | null; at: string };

function personOf(userId: string): { name: string; title: string; photo: string | null } {
  const user = findUser(userId);
  if (!user) return { name: userId, title: "", photo: null };
  const persona = personaOf(user);
  return { name: persona.nameTh, title: persona.title, photo: persona.photo };
}

/** The path as the page draws it: the sender, then everyone it reached, in order. */
export function pathSteps(matter: Matter): PathStep[] {
  const sender: PathStep = { key: `sender:${matter.senderId}`, ...personOf(matter.senderId), state: "sender", at: matter.at };
  return [sender, ...matter.path.map((hop, index) => ({ key: `${index}:${hop.userId}`, ...personOf(hop.userId), state: hop.state, at: hop.at }))];
}

function lineOf(event: MatterEvent): string {
  const actor = event.userId ? personOf(event.userId).name : TH.notifications.winyu;
  const words = TH.matter.event;
  if (event.kind === "passed_on") return words.passed_on(actor, event.toUserId ? personOf(event.toUserId).name : "");
  if (event.kind === "goal_met") return words.goal_met();
  return words[event.kind](actor);
}

/** The thread as the page prints it, oldest first. */
export function threadLines(matter: Matter): ThreadLine[] {
  return matter.thread.map((event, index) => ({ key: `${index}:${event.at}`, line: lineOf(event), text: event.text, at: event.at }));
}
