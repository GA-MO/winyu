import { TH } from "@/lib/i18n/th";
import { holdingHop, type Hop, type HopState, type Matter, type MatterEvent, type MatterEventKind, type Verdict } from "./matter";

export const MATTER_ACTIONS = ["accept", "ask", "reply", "pass_on", "not_mine", "done"] as const;

/** What a person can press on a matter: take it, ask the one who passed it, answer that question, pass it on, say it is not theirs, or close it. */
export type MatterActionKind = (typeof MATTER_ACTIONS)[number];

/** One press as the table applies it; not_mine arrives with the card's RACI owner already looked up; done on a matter about alerts may say what they were and what was done. */
export type MatterAction =
  | { kind: "accept" }
  | { kind: "ask"; text: string }
  | { kind: "reply"; text: string }
  | { kind: "pass_on"; toUserId: string }
  | { kind: "not_mine"; ownerId: string | null }
  | { kind: "done"; verdict?: Verdict; outcome?: string };

/** Why a press was refused: the matter is closed, it only informs, this person may not press that now, or the colleague picked cannot take it. */
export type MatterRefusal = "closed" | "fyi" | "not_allowed" | "bad_target";

/** Someone to tell once about a transition: a new holder is handed the matter; anyone else hears what changed, and for a pass-on to whom. */
export type Telling = { userId: string; handed: true } | { userId: string; handed: false; change: MatterEventKind; text: string | null; toUserId: string | null };

export type Transition = { ok: true; matter: Matter; tell: Telling[] } | { ok: false; refusal: MatterRefusal };

/** What one transition leaves: the new record and whom to tell. */
export type Step = { matter: Matter; tell: Telling[] };
type Rule<A extends MatterAction> = { may: (matter: Matter, actorId: string) => boolean; apply: (matter: Matter, actorId: string, action: A, at: string) => Step | MatterRefusal };

const UNANSWERED: ReadonlySet<HopState> = new Set(["sent", "seen"]);
const HELD: ReadonlySet<HopState> = new Set(["sent", "seen", "accepted"]);
const CLOSABLE: ReadonlySet<HopState> = new Set(["sent", "seen", "accepted", "asked"]);

function holds(matter: Matter, actorId: string, states: ReadonlySet<HopState>): boolean {
  const hop = holdingHop(matter);
  return hop?.userId === actorId && states.has(hop.state);
}

function withHolder(matter: Matter, state: HopState): Hop[] {
  const holder = holdingHop(matter);
  return matter.path.map((hop) => (hop === holder ? { ...hop, state } : hop));
}

function event(actorId: string, at: string, kind: MatterEventKind, text: string | null = null, toUserId: string | null = null): MatterEvent {
  return { userId: actorId, at, kind, text, toUserId };
}

function moved(matter: Matter, at: string, path: Hop[], line: MatterEvent, changes: Partial<Matter> = {}): Matter {
  return { ...matter, ...changes, path, thread: [...matter.thread, line], updatedAt: at };
}

function told(userId: string | null | undefined, actorId: string, change: MatterEventKind, text: string | null = null, toUserId: string | null = null): Telling[] {
  return userId && userId !== actorId ? [{ userId, handed: false, change, text, toUserId }] : [];
}

/** Each person once: the first telling of someone wins, so the sender who also passed it on hears one line. */
function once(tellings: readonly Telling[]): Telling[] {
  const seen = new Set<string>();
  return tellings.filter((telling) => !seen.has(telling.userId) && seen.add(telling.userId));
}

function passerOf(matter: Matter): string | null {
  return holdingHop(matter)?.fromUserId ?? null;
}

function passedOn(matter: Matter, actorId: string, toUserId: string, at: string): Step | MatterRefusal {
  if (toUserId === actorId) return "bad_target";
  const path = [...withHolder(matter, "passed_on"), { userId: toUserId, fromUserId: actorId, at, state: "sent" as const }];
  const tell = once([{ userId: toUserId, handed: true }, ...told(matter.senderId, actorId, "passed_on", null, toUserId)]);
  return { matter: moved(matter, at, path, event(actorId, at, "passed_on", null, toUserId)), tell };
}

function askedOf(matter: Matter, actorId: string, text: string, at: string, whom: string | null): Step {
  return { matter: moved(matter, at, withHolder(matter, "asked"), event(actorId, at, "asked", text)), tell: told(whom, actorId, "asked", text) };
}

function everyoneOn(matter: Matter): string[] {
  return [...new Set([matter.senderId, ...matter.path.map((hop) => hop.userId)])];
}

type Rules = { [K in MatterActionKind]: Rule<Extract<MatterAction, { kind: K }>> };

/** Every press: who may make it, and what it does to the path, the thread and whom it tells. */
export const MATTER_RULES: Rules = {
  accept: {
    may: (matter, actorId) => holds(matter, actorId, UNANSWERED),
    apply: (matter, actorId, _action, at) => ({
      matter: moved(matter, at, withHolder(matter, "accepted"), event(actorId, at, "accepted")),
      tell: once([...told(passerOf(matter), actorId, "accepted"), ...told(matter.senderId, actorId, "accepted")]),
    }),
  },
  ask: {
    may: (matter, actorId) => holds(matter, actorId, HELD),
    apply: (matter, actorId, action, at) => askedOf(matter, actorId, action.text, at, passerOf(matter)),
  },
  reply: {
    may: (matter, actorId) => {
      const hop = holdingHop(matter);
      return hop?.state === "asked" && hop.userId !== actorId && (hop.fromUserId === actorId || matter.senderId === actorId);
    },
    apply: (matter, actorId, action, at) => ({ matter: moved(matter, at, withHolder(matter, "seen"), event(actorId, at, "note", action.text)), tell: told(holdingHop(matter)?.userId, actorId, "note", action.text) }),
  },
  pass_on: {
    may: (matter, actorId) => holds(matter, actorId, HELD),
    apply: (matter, actorId, action, at) => passedOn(matter, actorId, action.toUserId, at),
  },
  not_mine: {
    may: (matter, actorId) => holds(matter, actorId, UNANSWERED),
    apply: (matter, actorId, action, at) => {
      const owner = action.ownerId;
      if (owner && owner !== actorId && owner !== matter.senderId) return passedOn(matter, actorId, owner, at);
      return askedOf(matter, actorId, TH.matter.notMineAsk, at, matter.senderId);
    },
  },
  done: {
    may: (matter, actorId) => matter.senderId === actorId || holds(matter, actorId, CLOSABLE),
    apply: (matter, actorId, action, at) => ({
      matter: moved(matter, at, matter.path, event(actorId, at, "done", action.outcome ?? null), { status: "done" }),
      tell: everyoneOn(matter).flatMap((userId) => told(userId, actorId, "done")),
    }),
  },
};

/** A matter whose number reached its goal: Winyu adds a goal_met line and closes it, and its sender and everyone on its path hear it once. Pure; the watch job stores, audits and notifies. */
export function goalMetOn(matter: Matter, at: string): Step {
  const line: MatterEvent = { userId: null, at, kind: "goal_met", text: null, toUserId: null };
  const tell = everyoneOn(matter).map((userId): Telling => ({ userId, handed: false, change: "goal_met", text: null, toUserId: null }));
  return { matter: moved(matter, at, matter.path, line, { status: "done" }), tell };
}

function refusalOf(matter: Matter, actorId: string, kind: MatterActionKind): MatterRefusal | null {
  if (matter.intent !== "act") return "fyi";
  if (matter.status !== "open") return "closed";
  return MATTER_RULES[kind].may(matter, actorId) ? null : "not_allowed";
}

/** Applies one press to a matter: the new record and whom to tell, or why it is refused. Pure; the caller stores, audits and notifies. */
export function transition<A extends MatterAction>(matter: Matter, actorId: string, action: A, at: string): Transition {
  const refusal = refusalOf(matter, actorId, action.kind);
  if (refusal) return { ok: false, refusal };
  const rule = MATTER_RULES[action.kind] as Rule<A>;
  const step = rule.apply(matter, actorId, action, at);
  return typeof step === "string" ? { ok: false, refusal: step } : { ok: true, ...step };
}

/** The presses this person may make on the matter now, in the order the actions line shows them. */
export function allowedActions(matter: Matter, actorId: string): MatterActionKind[] {
  return MATTER_ACTIONS.filter((kind) => refusalOf(matter, actorId, kind) === null);
}

/** Who a picker puts first: the card's owner (preselected, never the viewer), then the viewer's own line. */
export type MatterSuggestions = { ownerId: string | null; line: string[] };

/** A matter as a bell row, an Inbox row and the page's actions need it: no value from the card, only names, the ask and what the viewer may press. */
export type MatterBrief = { code: string; title: string; ask: string; senderName: string; passerName: string | null; at: string; actions: MatterActionKind[]; suggested: MatterSuggestions; judges: boolean };

/** Who a matter came from, and who passed it on when that was someone else. */
export function matterFrom(brief: Pick<MatterBrief, "senderName" | "passerName">): string {
  const from = TH.matter.from(brief.senderName);
  return brief.passerName ? `${from} · ${TH.matter.via(brief.passerName)}` : from;
}
