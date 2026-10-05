import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { fenceAsData } from "@/lib/harness/fence";
import { z } from "zod";
import type { Dim, MemoryFact, MetricId } from "@/lib/contracts";
import { memoryFacts, memoryReviews } from "@/lib/server/agent/collections";
import { findUser } from "@/lib/data/entities/users";
import { METRIC_LIST, METRICS } from "@/lib/semantic/metrics";
import type { Dictionary, EntityKind } from "@/lib/semantic/dictionary";
import { loadDictionary } from "@/lib/server/master-data";
import { utilityModel } from "@/lib/server/models";
import { TH } from "@/lib/i18n/th";
import { clusterFacts, findSameFact } from "./memory-match";
import { planReview } from "./memory-review";
import { CONFIDENCE_STEP, isTrusted, KNOWN_CONFIDENCE, memoryStatus, SAID_CONFIDENCE, lastSeenAt, seenCount } from "./memory-status";

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

/** A fact the extractor heard: `asked` when the user asked for it to be remembered or stated it as a standing fact about themselves. */
export type Extracted = { type: MemoryFact["type"]; value: string; sameAs?: string | null; asked?: boolean };

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
        type: z.enum(["interest", "vocabulary", "responsibility", "preference", "seasonal"]),
        value: z.string().min(MIN_VALUE_LENGTH).max(80),
        sameAs: z.string().nullable(),
        asked: z.boolean(),
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
  const model = utilityModel();
  if (!model) return null;
  const { text, idOf } = knownBlock(known.slice(0, MAX_KNOWN_SHOWN_TO_MODEL));
  try {
    const result = await generateObject({
      model,
      schema: factSchema,
      system: TH.memory.systemPrompt,
      prompt: [
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

function reinforce(fact: MemoryFact, origin: Origin): MemoryFact {
  if (fact.decayAt === null) return fact;
  const confidence = Math.min(MAX_CONFIDENCE, Math.max(ORIGIN[origin].floor, fact.confidence + CONFIDENCE_STEP));
  return memoryFacts().put({ ...fact, confidence, decayAt: decayAt(confidence), seen: seenCount(fact) + 1, lastSeenAt: new Date().toISOString() });
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
  });
}

function merge(userId: string, extracted: Extracted[], heardAs: Origin, threadId: string | null): MemoryFact[] {
  const mine = factsOf(userId);
  const touched = new Set<string>();
  const saved: MemoryFact[] = [];
  for (const fact of extracted) {
    const origin: Origin = fact.asked ? "asked" : heardAs;
    const named = fact.sameAs ? mine.find((candidate) => candidate.id === fact.sameAs && candidate.type === fact.type) : undefined;
    const existing = named ?? findSameFact(mine, fact);
    if (existing && touched.has(existing.id)) continue;
    if (existing) {
      touched.add(existing.id);
      saved.push(reinforce(existing, origin));
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

/** Drops facts whose decay date has passed. */
export function pruneMemory(userId: string): number {
  const now = new Date().toISOString();
  const stale = factsOf(userId).filter((fact) => fact.decayAt !== null && fact.decayAt < now);
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
  const threads = new Set(group.map((fact) => fact.sourceThreadId).filter((thread) => thread !== null && thread !== head.sourceThreadId));
  const confirmed = group.some((fact) => fact.decayAt === null);
  const confidence = confirmed ? MAX_CONFIDENCE : Math.min(MAX_CONFIDENCE, Math.max(...group.map((fact) => fact.confidence)) + CONFIDENCE_STEP * threads.size);
  const createdAt = group.map((fact) => fact.createdAt).sort()[0] ?? head.createdAt;
  const wording = rewrite && !isProtected(head) ? { type: rewrite.type, value: rewrite.value.trim() } : {};
  for (const fact of group) if (fact.id !== head.id) memoryFacts().remove(fact.id);
  const seen = group.reduce((total, fact) => total + seenCount(fact), 0);
  const lastSeen = group.map(lastSeenAt).sort().at(-1) ?? head.createdAt;
  return memoryFacts().put({ ...head, ...wording, confidence, createdAt, decayAt: confirmed ? null : decayAt(confidence), seen, lastSeenAt: lastSeen });
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

/** Forgets everything Winyu remembers about this user. */
export function forgetAll(userId: string): number {
  const facts = factsOf(userId);
  for (const fact of facts) memoryFacts().remove(fact.id);
  return facts.length;
}

/** After a save: learn from the questions that are new in it, matching them against what is already known so a repeat strengthens a fact instead of adding one. */
export async function rememberTurn(userId: string, turns: HeardTurn[], threadId: string | null): Promise<MemoryFact[]> {
  pruneMemory(userId);
  const heard = turns.filter((turn) => turn.prompt.trim().length > 0);
  if (heard.length === 0) return [];
  const known = factsOf(userId).sort(keepOrder);
  const extracted = (await extractByModel(userId, heard, known)) ?? extractByRule(heard.map((turn) => turn.prompt), await loadDictionary());
  return learnExtracted(userId, extracted, threadId);
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
