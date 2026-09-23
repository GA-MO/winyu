import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { z } from "zod";
import type { MemoryFact } from "@/lib/contracts";
import { memoryFacts } from "@/lib/server/agent/collections";
import { METRIC_LIST } from "@/lib/semantic/metrics";
import { resolveEntity, type EntityKind } from "@/lib/semantic/dictionary";
import { models } from "@/lib/server/models";
import { TH } from "@/lib/i18n/th";

const DECAY_DAYS = 90;
const MAX_FACTS_PER_TURN = 4;
const MAX_TURNS_READ = 3;
const BASE_CONFIDENCE = 0.45;
const CONFIDENCE_STEP = 0.15;
const MAX_CONFIDENCE = 0.98;
const DAY_MS = 86_400_000;
const MOCK_MODEL = "mock";
const ENTITY_KINDS: EntityKind[] = ["agent", "sku", "dc", "campaign", "brand"];

export type Extracted = { type: MemoryFact["type"]; value: string };

const factSchema = z.object({
  facts: z
    .array(
      z.object({
        type: z.enum(["interest", "vocabulary", "responsibility", "preference", "seasonal"]),
        value: z.string().min(3).max(120),
      }),
    )
    .max(MAX_FACTS_PER_TURN),
});

function decayAt(): string {
  return new Date(Date.now() + DECAY_DAYS * DAY_MS).toISOString();
}

function keyOf(fact: Extracted): string {
  return `${fact.type}|${fact.value.trim()}`;
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
export function extractByRule(prompts: string[]): Extracted[] {
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
      const entity = resolveEntity(kind, prompt);
      if (!entity) continue;
      const fact: Extracted = { type: "responsibility", value: TH.memory.entity(entity.label) };
      found.set(keyOf(fact), fact);
    }
  }
  return [...found.values()].slice(0, MAX_FACTS_PER_TURN);
}

async function extractByModel(prompts: string[]): Promise<Extracted[] | null> {
  const registry = models();
  const [id] = Object.keys(registry);
  const entry = id ? registry[id] : undefined;
  if (!id || id === MOCK_MODEL || !entry || typeof entry !== "object" || !("model" in entry)) return null;
  const model = typeof entry.model === "function" ? entry.model() : entry.model;
  try {
    const result = await generateObject({
      model,
      schema: factSchema,
      system: TH.memory.systemPrompt,
      prompt: prompts.join("\n"),
    });
    return result.object.facts;
  } catch {
    return null;
  }
}

function merge(userId: string, extracted: Extracted[], threadId: string | null): MemoryFact[] {
  const store = memoryFacts();
  const mine = store.where((fact) => fact.userId === userId);
  const byKey = new Map(mine.map((fact) => [keyOf(fact), fact]));
  const saved: MemoryFact[] = [];
  for (const fact of extracted) {
    const existing = byKey.get(keyOf(fact));
    if (existing) {
      saved.push(store.put({ ...existing, confidence: Math.min(MAX_CONFIDENCE, existing.confidence + CONFIDENCE_STEP), decayAt: decayAt() }));
      continue;
    }
    saved.push(
      store.put({
        id: randomUUID(),
        userId,
        type: fact.type,
        value: fact.value,
        confidence: BASE_CONFIDENCE,
        sourceThreadId: threadId,
        createdAt: new Date().toISOString(),
        decayAt: decayAt(),
      }),
    );
  }
  return saved;
}

/** Drops facts whose decay date has passed. */
export function pruneMemory(userId: string): number {
  const store = memoryFacts();
  const now = new Date().toISOString();
  const stale = store.where((fact) => fact.userId === userId && fact.decayAt !== null && fact.decayAt < now);
  for (const fact of stale) store.remove(fact.id);
  return stale.length;
}

/** After a completed turn: extract what is worth remembering, dedupe it against what is already known. */
export async function rememberTurn(userId: string, turns: { prompt: string }[], threadId: string | null): Promise<MemoryFact[]> {
  pruneMemory(userId);
  const prompts = turns.slice(-MAX_TURNS_READ).map((turn) => turn.prompt);
  if (prompts.length === 0) return [];
  const extracted = (await extractByModel(prompts)) ?? extractByRule(prompts);
  return merge(userId, extracted, threadId);
}

/** Remembers something the user did rather than said — a line they set, where they sent a problem, what they said is not theirs. */
export function rememberAction(userId: string, fact: Extracted): MemoryFact[] {
  pruneMemory(userId);
  return merge(userId, [fact], null);
}
