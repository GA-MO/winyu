import { randomUUID } from "node:crypto";
import { fenceAsData } from "@/lib/harness/fence";
import { z } from "zod";
import { MEMORY_FACT_TYPES, type AccessContext, type Dim, type MemoryFact, type MemoryFactType, type MemoryTombstone, type MetricId } from "@/lib/contracts";
import { memoryFacts, memoryReviews, memoryTombstones } from "@/lib/server/agent/collections";
import { findUser } from "@/lib/data/entities/users";
import { METRIC_LIST, METRICS } from "@/lib/semantic/metrics";
import type { Dictionary, EntityKind } from "@/lib/semantic/dictionary";
import { loadDictionary } from "@/lib/server/master-data";
import { TH } from "@/lib/i18n/th";
import { clusterFacts, findSameFact, isSameFact, sameSlice, similarity, sliceOf } from "./memory-match";
import { planReview } from "./memory-review";
import { CONFIDENCE_STEP, isExpired, isTrusted, KNOWN_CONFIDENCE, memoryStatus, memoryToday, SAID_CONFIDENCE, lastSeenAt, seenCount } from "./memory-status";

const KNOWN_DECAY_DAYS = 90;
const LEARNING_DECAY_DAYS = 14;
const MAX_FACTS_PER_TURN = 3;
const MAX_TRUSTED_PER_USER = 30;
const MAX_LEARNING_PER_USER = 10;
const MAX_KNOWN_SHOWN_TO_MODEL = MAX_TRUSTED_PER_USER + MAX_LEARNING_PER_USER;
const DID_CONFIDENCE = 0.75;
const MAX_CONFIDENCE = 0.98;
const DAY_MS = 86_400_000;
const MIN_VALUE_LENGTH = 3;
const MAX_VALUE_LENGTH = 120;
const REVIEW_INTERVAL_MS = DAY_MS;
const KNOWN_ID_PREFIX = "k";
const ENTITY_KINDS: EntityKind[] = ["agent", "sku", "dc", "campaign", "brand"];
const MAX_THREADS_KEPT = 12;
const FORGET_SIMILARITY = 0.5;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIGURE = /[0-9๐-๙]{2,}|[0-9๐-๙]\s*(?:%|ล้าน|พัน|หมื่น|แสน|บาท|ลิตร|เท่า)/;
const DEFINES_WORD = /เรียก.{0,60}ว่า|หมายถึง|แปลว่า/;
const SCOPED_TYPES: ReadonlySet<MemoryFactType> = new Set(["interest", "responsibility"]);
const SCOPED_ANCHORS: readonly { prefix: string; scope: (access: AccessContext) => readonly string[] | "all" }[] = [
  { prefix: "region:", scope: (access) => access.regions },
  { prefix: "brand:", scope: (access) => access.brands },
];
const LOOSE_CHARS = /[\s"'“”‘’ๆ.,()]/g;
const WORD_DEFINITION = /\s*(?:หมายถึง|แปลว่า|คือ|=)\s*/;
const QUOTED_WORD = /["“'‘]([^"”'’]+)["”'’]/;
const CALLED_WORD = /เรียก.{0,60}?ว่า\s*(\S+)/;
const MAX_TERM_LENGTH = 30;
const MAX_FORGOTTEN_TERMS = 8;

/** A fact the extractor heard: `asked` when the user asked for it to be remembered or stated it as a standing fact about themselves; `until` the last day a dated fact holds. */
export type Extracted = { type: MemoryFactType; value: string; sameAs?: string | null; asked?: boolean; until?: string | null };

/** A question to learn from, with the metric slice the answer was built from when there was one. */
export type HeardTurn = { prompt: string; metric?: MetricId | null; dims?: Dim[] };

type Origin = "said" | "asked" | "did";

const ORIGIN: Record<Origin, { start: number; floor: number }> = {
  said: { start: SAID_CONFIDENCE, floor: 0 },
  asked: { start: DID_CONFIDENCE, floor: DID_CONFIDENCE },
  did: { start: DID_CONFIDENCE, floor: DID_CONFIDENCE },
};

const factSchema = z.object({
  facts: z
    .array(
      z.object({
        type: z.enum(MEMORY_FACT_TYPES),
        value: z.string().min(MIN_VALUE_LENGTH).max(80),
        sameAs: z.string().nullable(),
        asked: z.boolean(),
        until: z.string().regex(ISO_DATE).nullable(),
      }),
    )
    .max(MAX_FACTS_PER_TURN),
});

function decayAt(confidence: number): string {
  const days = confidence >= KNOWN_CONFIDENCE ? KNOWN_DECAY_DAYS : LEARNING_DECAY_DAYS;
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function keyOf(fact: Extracted): string {
  return `${fact.type}|${fact.value.trim()}`;
}

function factsOf(userId: string): MemoryFact[] {
  return memoryFacts().where((fact) => fact.userId === userId);
}

/** Whether a text carries a figure (an amount, a percentage, a count with a unit): memory never holds one, every number comes from a tool. */
export function holdsFigure(value: string): boolean {
  return FIGURE.test(value);
}

function loose(text: string): string {
  return text.toLowerCase().replace(LOOSE_CHARS, "");
}

function tombstonesOf(userId: string): MemoryTombstone[] {
  return memoryTombstones().where((tombstone) => tombstone.userId === userId);
}

function buries(tombstone: MemoryTombstone, fact: Pick<MemoryFact, "type" | "value">): boolean {
  if (tombstone.type === null) return loose(fact.value).includes(loose(tombstone.value));
  return isSameFact({ type: tombstone.type, value: tombstone.value }, fact);
}

/** Whether the person rejected this fact or asked Winyu to forget it, so learning must not bring it back. */
export function isBuried(userId: string, fact: Pick<MemoryFact, "type" | "value">): boolean {
  return tombstonesOf(userId).some((tombstone) => buries(tombstone, fact));
}

function bury(userId: string, type: MemoryFactType | null, value: string): void {
  const wording = value.trim();
  if (tombstonesOf(userId).some((tombstone) => tombstone.type === type && tombstone.value === wording)) return;
  memoryTombstones().put({ id: randomUUID(), userId, type, value: wording, at: new Date().toISOString() });
}

function unbury(userId: string, fact: Pick<MemoryFact, "type" | "value">): void {
  for (const tombstone of tombstonesOf(userId)) if (buries(tombstone, fact)) memoryTombstones().remove(tombstone.id);
}

function heardIn(fact: MemoryFact): string[] {
  return fact.threads ?? (fact.sourceThreadId ? [fact.sourceThreadId] : []);
}

function datedBy(until: string | null | undefined): Pick<MemoryFact, "until"> {
  return until ? { until } : {};
}

const SYNONYM_OWNERS = (() => {
  const owners = new Map<string, number>();
  for (const def of METRIC_LIST) {
    for (const synonym of def.synonyms) owners.set(synonym.toLowerCase(), (owners.get(synonym.toLowerCase()) ?? 0) + 1);
  }
  return owners;
})();

function identifies(synonym: string): boolean {
  return (SYNONYM_OWNERS.get(synonym.toLowerCase()) ?? 0) === 1;
}

/** What the rule-based extractor keeps when no model is configured: the metrics asked for and the entities named. */
export function extractByRule(prompts: string[], dictionary: Dictionary): Extracted[] {
  const found = new Map<string, Extracted>();
  for (const prompt of prompts) {
    const lower = prompt.toLowerCase();
    for (const def of METRIC_LIST) {
      const isLabel = lower.includes(def.labelTh.toLowerCase());
      const hit = def.synonyms.find((synonym) => synonym.length > 2 && identifies(synonym) && lower.includes(synonym.toLowerCase()));
      if (!isLabel && !hit) continue;
      const interest: Extracted = { type: "interest", value: TH.memory.interest(def.labelTh) };
      found.set(keyOf(interest), interest);
      if (hit && !isLabel) {
        const vocabulary: Extracted = { type: "vocabulary", value: TH.memory.vocabulary(hit, def.labelTh) };
        found.set(keyOf(vocabulary), vocabulary);
      }
    }
    for (const kind of ENTITY_KINDS) {
      const entity = dictionary.resolveEntity(kind, prompt);
      if (!entity) continue;
      const fact: Extracted = { type: "responsibility", value: TH.memory.entity(entity.label) };
      found.set(keyOf(fact), fact);
    }
  }
  return [...found.values()].slice(0, MAX_FACTS_PER_TURN);
}

function knownBlock(known: MemoryFact[]): { text: string; idOf: Map<string, string> } {
  const idOf = new Map<string, string>();
  const lines = known.map((fact, index) => {
    const shortId = `${KNOWN_ID_PREFIX}${index + 1}`;
    idOf.set(shortId, fact.id);
    return `${shortId} [${fact.type}] ${fact.value}`;
  });
  return { text: lines.join("\n") || TH.memory.nothingKnown, idOf };
}

function whoOf(userId: string): string {
  const user = findUser(userId);
  return user ? `${user.title} (${user.role})` : userId;
}

function questionLine(turn: HeardTurn): string {
  if (!turn.metric) return turn.prompt;
  return TH.memory.answeredWith(turn.prompt, METRICS[turn.metric].labelTh, (turn.dims ?? []).map((dim) => TH.dim[dim] ?? dim));
}

async function extractByModel(userId: string, turns: HeardTurn[], known: MemoryFact[]): Promise<Extracted[] | null> {
  const { utilityModel } = await import("@/lib/server/models");
  const model = utilityModel();
  if (!model) return null;
  const { generateObject } = await import("ai");
  const { text, idOf } = knownBlock(known.slice(0, MAX_KNOWN_SHOWN_TO_MODEL));
  try {
    const result = await generateObject({
      model,
      schema: factSchema,
      system: TH.memory.systemPrompt,
      prompt: [
        TH.memory.today(memoryToday()),
        TH.memory.reviewWho(whoOf(userId)),
        TH.memory.knownHeading,
        fenceAsData(text),
        TH.memory.questionsHeading,
        fenceAsData(turns.map(questionLine).join("\n")),
      ].join("\n"),
    });
    return result.object.facts.map((fact) => ({ ...fact, sameAs: fact.sameAs ? (idOf.get(fact.sameAs) ?? null) : null }));
  } catch {
    return null;
  }
}

/** Hearing a fact again: a repeat from the same conversation is not new evidence, so only another conversation, something asked for or something done raises it. */
function reinforce(fact: MemoryFact, origin: Origin, threadId: string | null, until: string | null | undefined): MemoryFact {
  const now = new Date().toISOString();
  if (fact.decayAt === null) return until ? memoryFacts().put({ ...fact, until }) : fact;
  const sameConversation = origin === "said" && threadId !== null && heardIn(fact).includes(threadId);
  if (sameConversation) return memoryFacts().put({ ...fact, ...datedBy(until), lastSeenAt: now });
  const confidence = Math.min(MAX_CONFIDENCE, Math.max(ORIGIN[origin].floor, fact.confidence + CONFIDENCE_STEP));
  const threads = threadId ? [...heardIn(fact).filter((thread) => thread !== threadId), threadId].slice(-MAX_THREADS_KEPT) : heardIn(fact);
  return memoryFacts().put({ ...fact, ...datedBy(until), confidence, decayAt: decayAt(confidence), seen: seenCount(fact) + 1, lastSeenAt: now, threads });
}

function add(userId: string, fact: Extracted, origin: Origin, threadId: string | null): MemoryFact {
  const confidence = ORIGIN[origin].start;
  return memoryFacts().put({
    id: randomUUID(),
    userId,
    type: fact.type,
    value: fact.value.trim(),
    confidence,
    sourceThreadId: threadId,
    createdAt: new Date().toISOString(),
    decayAt: decayAt(confidence),
    seen: 1,
    lastSeenAt: new Date().toISOString(),
    threads: threadId ? [threadId] : [],
    ...datedBy(fact.until),
  });
}

/** Whether a heard fact may be kept: what the person said never carries a figure, and something they rejected or asked to forget is only learned again when they ask for it or act on it. */
function admits(userId: string, fact: Extracted, origin: Origin): boolean {
  if (origin === "did") return true;
  if (holdsFigure(fact.value)) return false;
  if (origin === "said") return !isBuried(userId, fact);
  unbury(userId, fact);
  return true;
}

function merge(userId: string, extracted: Extracted[], heardAs: Origin, threadId: string | null): MemoryFact[] {
  const mine = factsOf(userId);
  const touched = new Set<string>();
  const saved: MemoryFact[] = [];
  for (const fact of extracted) {
    const origin: Origin = fact.asked ? "asked" : heardAs;
    if (!admits(userId, fact, origin)) continue;
    const named = fact.sameAs ? mine.find((candidate) => candidate.id === fact.sameAs && candidate.type === fact.type && sameSlice(candidate.value, fact.value)) : undefined;
    const existing = named ?? findSameFact(mine, fact);
    if (existing && touched.has(existing.id)) continue;
    if (existing) {
      touched.add(existing.id);
      saved.push(reinforce(existing, origin, threadId, fact.until));
      continue;
    }
    const created = add(userId, fact, origin, threadId);
    touched.add(created.id);
    mine.push(created);
    saved.push(created);
  }
  enforceCap(userId);
  return saved.filter((fact) => memoryFacts().get(fact.id));
}

function keepOrder(left: MemoryFact, right: MemoryFact): number {
  const rank = { confirmed: 2, known: 1, learning: 0 };
  const byStatus = rank[memoryStatus(right)] - rank[memoryStatus(left)];
  if (byStatus !== 0) return byStatus;
  if (right.confidence !== left.confidence) return right.confidence - left.confidence;
  return lastSeenFirst(left, right);
}

function lastSeenFirst(left: MemoryFact, right: MemoryFact): number {
  return (right.decayAt ?? "").localeCompare(left.decayAt ?? "");
}

function enforceCap(userId: string): number {
  const facts = factsOf(userId);
  const surplus = [
    ...facts.filter(isTrusted).sort(keepOrder).slice(MAX_TRUSTED_PER_USER),
    ...facts.filter((fact) => !isTrusted(fact)).sort(lastSeenFirst).slice(MAX_LEARNING_PER_USER),
  ];
  for (const fact of surplus) memoryFacts().remove(fact.id);
  return surplus.length;
}

/** Drops facts whose decay date has passed and dated facts whose day is over. */
export function pruneMemory(userId: string): number {
  const now = new Date().toISOString();
  const today = memoryToday();
  const stale = factsOf(userId).filter((fact) => (fact.decayAt !== null && fact.decayAt < now) || isExpired(fact, today));
  for (const fact of stale) memoryFacts().remove(fact.id);
  return stale.length;
}

function isProtected(fact: MemoryFact): boolean {
  return fact.decayAt === null || fact.sourceThreadId === null;
}

function headOf(group: MemoryFact[]): MemoryFact {
  return [...group].sort((left, right) => Number(isProtected(right)) - Number(isProtected(left)) || right.confidence - left.confidence)[0] as MemoryFact;
}

function foldInto(head: MemoryFact, group: MemoryFact[], rewrite: Pick<MemoryFact, "type" | "value"> | null): MemoryFact {
  const heard = [...new Set(group.flatMap(heardIn))];
  const otherThreads = heard.filter((thread) => !heardIn(head).includes(thread));
  const confirmed = group.some((fact) => fact.decayAt === null);
  const confidence = confirmed ? MAX_CONFIDENCE : Math.min(MAX_CONFIDENCE, Math.max(...group.map((fact) => fact.confidence)) + CONFIDENCE_STEP * otherThreads.length);
  const createdAt = group.map((fact) => fact.createdAt).sort()[0] ?? head.createdAt;
  const wording = rewrite && !isProtected(head) ? { type: rewrite.type, value: rewrite.value.trim() } : {};
  for (const fact of group) if (fact.id !== head.id) memoryFacts().remove(fact.id);
  const seen = group.reduce((total, fact) => total + seenCount(fact), 0);
  const lastSeen = group.map(lastSeenAt).sort().at(-1) ?? head.createdAt;
  return memoryFacts().put({ ...head, ...wording, confidence, createdAt, decayAt: confirmed ? null : decayAt(confidence), seen, lastSeenAt: lastSeen, threads: heard.slice(-MAX_THREADS_KEPT) });
}

/** Folds paraphrases of one fact into its most confident wording (a repeat from another conversation counts as evidence), then trims to the per-user caps. */
export function consolidateMemory(userId: string): { before: number; after: number } {
  pruneMemory(userId);
  const before = factsOf(userId).length;
  for (const group of clusterFacts(factsOf(userId))) {
    if (group.length > 1) foldInto(headOf(group), group, null);
  }
  enforceCap(userId);
  return { before, after: factsOf(userId).length };
}

/** Lets the model fold what the similarity check missed and drop guesses and facts about the system; confirmed facts and facts learned from actions are never dropped or reworded. */
export async function reviewMemory(userId: string): Promise<{ before: number; after: number } | null> {
  const { before } = consolidateMemory(userId);
  const facts = factsOf(userId).sort(keepOrder);
  const plan = await planReview(facts, whoOf(userId));
  if (!plan) return null;
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  for (const id of plan.drop) {
    const fact = byId.get(id);
    if (!fact || isProtected(fact)) continue;
    memoryFacts().remove(id);
    byId.delete(id);
  }
  for (const group of plan.groups) {
    const members = group.ids.flatMap((id) => byId.get(id) ?? []);
    if (members.length === 0) continue;
    const head = headOf(members);
    const folded = foldInto(head, members, group);
    for (const member of members) byId.delete(member.id);
    byId.set(folded.id, folded);
  }
  enforceCap(userId);
  const after = factsOf(userId).length;
  memoryReviews().put({ id: userId, at: new Date().toISOString(), before, after });
  return { before, after };
}

function reviewIsDue(userId: string): boolean {
  if (factsOf(userId).filter(isTrusted).length < MAX_TRUSTED_PER_USER) return false;
  const last = memoryReviews().get(userId);
  return !last || Date.now() - Date.parse(last.at) > REVIEW_INTERVAL_MS;
}

/** The user said this fact is right: it is kept for good and always reaches the persona. */
export function confirmMemory(userId: string, id: string): MemoryFact | null {
  const fact = memoryFacts().get(id);
  if (!fact || fact.userId !== userId) return null;
  return memoryFacts().put({ ...fact, confidence: MAX_CONFIDENCE, decayAt: null });
}

/** The user rewrote a fact in their own words: the new wording replaces the old and counts as confirmed. */
export function editMemory(userId: string, id: string, value: string): MemoryFact | null {
  const fact = memoryFacts().get(id);
  const wording = value.trim();
  if (!fact || fact.userId !== userId || wording.length < MIN_VALUE_LENGTH || wording.length > MAX_VALUE_LENGTH) return null;
  return memoryFacts().put({ ...fact, value: wording, confidence: MAX_CONFIDENCE, decayAt: null });
}

/** Forgets everything Winyu remembers about this user, the record of what they rejected included. */
export function forgetAll(userId: string): number {
  const facts = factsOf(userId);
  for (const fact of facts) memoryFacts().remove(fact.id);
  for (const tombstone of tombstonesOf(userId)) memoryTombstones().remove(tombstone.id);
  return facts.length;
}

/** The person rejected a fact (deleted it or said it is wrong): it is removed and never learned again from what they merely say. */
export function rejectMemory(userId: string, id: string): MemoryFact | null {
  const fact = memoryFacts().get(id);
  if (!fact || fact.userId !== userId) return null;
  memoryFacts().remove(id);
  bury(userId, fact.type, fact.value);
  return fact;
}

function isAbout(fact: MemoryFact, about: string): boolean {
  return loose(fact.value).includes(loose(about)) || similarity(about, fact.value) >= FORGET_SIMILARITY;
}

/** The person's facts, still learning or trusted, that a request to forget `about` names. */
export function memoryAbout(userId: string, about: string): MemoryFact[] {
  return factsOf(userId).filter((fact) => isAbout(fact, about));
}

/** The person asked Winyu to forget something: every fact about it is removed and buried, and so is the phrase itself, so neither the prompt, recall nor learning brings it back. */
export function forgetAbout(userId: string, about: string): MemoryFact[] {
  const forgotten = memoryAbout(userId, about);
  for (const fact of forgotten) {
    memoryFacts().remove(fact.id);
    bury(userId, fact.type, fact.value);
  }
  bury(userId, null, about);
  return forgotten;
}

function isCertifiedTerm(term: string): boolean {
  const wanted = loose(term);
  return METRIC_LIST.some((def) => [def.labelTh, ...def.synonyms].some((word) => loose(word) === wanted));
}

function termOf(tombstone: MemoryTombstone): string {
  if (tombstone.type !== "vocabulary") return tombstone.value.trim();
  const named = tombstone.value.match(QUOTED_WORD)?.[1] ?? tombstone.value.match(CALLED_WORD)?.[1];
  return (named ?? tombstone.value.split(WORD_DEFINITION)[0] ?? "").trim();
}

/** The words whose private meaning the person asked Winyu to forget, leaving out any the semantic layer certifies as common jargon: a later question that uses one is asked about, not read the old way. */
export function forgottenTerms(userId: string): string[] {
  const buried = tombstonesOf(userId);
  const vocabulary = buried.filter((tombstone) => tombstone.type === "vocabulary");
  const words = buried
    .filter((tombstone) => tombstone.type === "vocabulary" || (tombstone.type === null && vocabulary.some((defined) => loose(defined.value).includes(loose(tombstone.value)))))
    .map(termOf)
    .filter((term) => term.length > 0 && term.length <= MAX_TERM_LENGTH && !isCertifiedTerm(term));
  return [...new Map(words.map((term) => [loose(term), term])).values()].slice(0, MAX_FORGOTTEN_TERMS);
}

/** The person asked in chat for this to be remembered and approved its wording: it is kept as confirmed (until its day is over, when dated), replaces a fact that says the same thing, and lifts any earlier rejection of it; null when it carries a figure. */
export function rememberStated(userId: string, stated: Pick<Extracted, "type" | "value" | "until">, threadId: string | null): MemoryFact | null {
  const value = stated.value.trim();
  if (holdsFigure(value) || value.length < MIN_VALUE_LENGTH || value.length > MAX_VALUE_LENGTH) return null;
  const fact = { type: stated.type, value };
  unbury(userId, fact);
  const now = new Date().toISOString();
  const confirmed = { ...fact, confidence: MAX_CONFIDENCE, decayAt: null, lastSeenAt: now, until: stated.until ?? null };
  const existing = findSameFact(factsOf(userId), fact);
  if (existing) return memoryFacts().put({ ...existing, ...confirmed, seen: seenCount(existing) + 1 });
  return memoryFacts().put({ id: randomUUID(), userId, ...confirmed, sourceThreadId: threadId, createdAt: now, seen: 1, threads: threadId ? [threadId] : [] });
}

/** Whether a fact names a region or brand the person cannot see: an interest in data outside their scope is a refused ask, not something they follow. */
export function namesOutsideScope(fact: Pick<Extracted, "type" | "value">, access: AccessContext): boolean {
  if (!SCOPED_TYPES.has(fact.type)) return false;
  const slice = [...sliceOf(fact.value)];
  return SCOPED_ANCHORS.some(({ prefix, scope }) => {
    const allowed = scope(access);
    return allowed !== "all" && slice.some((anchor) => anchor.startsWith(prefix) && !allowed.includes(anchor.slice(prefix.length)));
  });
}

async function accessOfUser(userId: string): Promise<AccessContext | null> {
  const user = findUser(userId);
  if (!user) return null;
  const { liveAccessFor } = await import("@/lib/access/enforce");
  return liveAccessFor(user);
}

/** After a save: learn from the questions that are new in it, matching them against what is already known so a repeat strengthens a fact instead of adding one. */
export async function rememberTurn(userId: string, turns: HeardTurn[], threadId: string | null): Promise<MemoryFact[]> {
  pruneMemory(userId);
  const heard = turns.filter((turn) => turn.prompt.trim().length > 0);
  if (heard.length === 0) return [];
  const known = factsOf(userId).sort(keepOrder);
  const extracted = (await extractByModel(userId, heard, known)) ?? extractByRule(heard.map((turn) => turn.prompt), await loadDictionary());
  const definesWord = heard.some((turn) => DEFINES_WORD.test(turn.prompt));
  const access = await accessOfUser(userId);
  const kept = extracted.filter((fact) => (fact.type !== "vocabulary" || fact.asked === true || definesWord) && !(access && namesOutsideScope(fact, access)));
  return learnExtracted(userId, kept, threadId);
}

/** Saves what the extractor heard in one turn: a fact the user asked to be remembered is trusted at once, the rest waits to be heard again. */
export function learnExtracted(userId: string, extracted: Extracted[], threadId: string | null): MemoryFact[] {
  const saved = merge(userId, extracted, "said", threadId);
  if (reviewIsDue(userId)) void reviewMemory(userId);
  return saved;
}

/** Puts forward something Winyu inferred about the user as still learning: it stays out of the prompt until the user confirms it in /memory or it comes up again. */
export function proposeMemory(userId: string, fact: Extracted): MemoryFact[] {
  pruneMemory(userId);
  return merge(userId, [fact], "said", null);
}

/** Remembers something the user did rather than said — a line they set, where they sent a problem, what they said is not theirs. */
export function rememberAction(userId: string, fact: Extracted): MemoryFact[] {
  pruneMemory(userId);
  return merge(userId, [fact], "did", null);
}
