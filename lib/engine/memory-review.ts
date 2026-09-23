import { generateObject } from "ai";
import { fenceAsData } from "vexa/server";
import { z } from "zod";
import type { MemoryFact } from "@/lib/contracts";
import { utilityModel } from "@/lib/server/models";
import { TH } from "@/lib/i18n/th";

const SHORT_ID_PREFIX = "f";

const reviewSchema = z.object({
  groups: z.array(
    z.object({
      ids: z.array(z.string()).min(1),
      type: z.enum(["interest", "vocabulary", "responsibility", "preference", "seasonal"]),
      value: z.string().min(3).max(80),
    }),
  ),
  drop: z.array(z.string()),
});

export type ReviewPlan = { groups: { ids: string[]; type: MemoryFact["type"]; value: string }[]; drop: string[] };

/** Asks the model to fold one user's facts into distinct statements and name the ones that are guesses or about the system; ids come back as real fact ids. */
export async function planReview(facts: MemoryFact[], who: string): Promise<ReviewPlan | null> {
  const model = utilityModel();
  if (!model || facts.length === 0) return null;
  const idOf = new Map(facts.map((fact, index) => [`${SHORT_ID_PREFIX}${index + 1}`, fact.id]));
  const listing = facts.map((fact, index) => `${SHORT_ID_PREFIX}${index + 1} [${fact.type}] ${fact.value}`).join("\n");
  try {
    const { object } = await generateObject({
      model,
      schema: reviewSchema,
      system: TH.memory.reviewPrompt,
      prompt: [TH.memory.reviewWho(who), TH.memory.knownHeading, fenceAsData(listing)].join("\n"),
    });
    const real = (ids: string[]) => ids.flatMap((id) => idOf.get(id) ?? []);
    return {
      groups: object.groups.map((group) => ({ ...group, ids: real(group.ids) })).filter((group) => group.ids.length > 0),
      drop: real(object.drop),
    };
  } catch {
    return null;
  }
}
