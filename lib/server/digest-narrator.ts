import { generateObject, type LanguageModel } from "ai";
import { fenceAsData } from "vexa/server";
import { z } from "zod";
import { isTrusted } from "@/lib/engine/memory-status";
import { TH } from "@/lib/i18n/th";
import { memoryFacts } from "@/lib/server/agent/collections";
import { utilityModel } from "@/lib/server/models";

const MAX_LEAD_CHARS = 280;
const MAX_FACTS = 8;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const LINK = /https?:\/\//i;

const narrationSchema = z.object({
  lead: z.string().min(1).max(MAX_LEAD_CHARS),
  order: z.array(z.string()),
});

export type DigestLine = { id: string; text: string };
export type Narration = { lead: string; order: string[] };
export type Narrator = (who: string, lines: readonly DigestLine[], facts: readonly string[]) => Promise<Narration | null>;

/** Whether a lead says only what the lines say: every number in it appears in the lines, it links nowhere, and it is short. */
export function isGrounded(lead: string, lines: readonly DigestLine[]): boolean {
  if (lead.length > MAX_LEAD_CHARS || LINK.test(lead)) return false;
  const source = lines.map((line) => line.text).join("\n");
  return (lead.match(NUMBER) ?? []).every((number) => source.includes(number));
}

/** What Cop has come to trust about the user, strongest first, as plain statements the narrator may lean on. */
export function factsFor(userId: string): string[] {
  return memoryFacts()
    .where((fact) => fact.userId === userId && isTrusted(fact))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_FACTS)
    .map((fact) => fact.value);
}

async function narrateWith(model: LanguageModel, who: string, lines: readonly DigestLine[], facts: readonly string[]): Promise<Narration | null> {
  const listing = lines.map((line) => `${line.id} ${line.text}`).join("\n");
  const known = facts.length > 0 ? [TH.digest.narrateFacts, fenceAsData(facts.join("\n"))] : [];
  const { object } = await generateObject({
    model,
    schema: narrationSchema,
    system: TH.digest.narratePrompt,
    prompt: [TH.digest.narrateWho(who), TH.digest.narrateLines, fenceAsData(listing), ...known].join("\n"),
  });
  return object;
}

/**
 * The morning's lead sentence and reading order from the utility model; null when no real model is configured,
 * the call fails, or the lead says anything the lines do not. The lines themselves are always the rules' own.
 */
export const narrateDigest: Narrator = async (who, lines, facts) => {
  const model = utilityModel();
  if (!model || lines.length === 0) return null;
  try {
    const narration = await narrateWith(model, who, lines, facts);
    if (!narration || !isGrounded(narration.lead, lines)) return null;
    const known = new Set(lines.map((line) => line.id));
    return { lead: narration.lead.trim(), order: narration.order.filter((id) => known.has(id)) };
  } catch {
    return null;
  }
};
