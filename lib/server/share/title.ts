import { dimFiltersSchema, type DimValues } from "@/lib/contracts";
import { namesOf, resolveFilters } from "@/lib/semantic/dictionary";
import { loadDictionary } from "@/lib/server/master-data";
import { shareSubject, shareTitle, type SharedCard } from "@/lib/share/card";

/** The Thai names of the filters a card's first read asked for (its words as the model wrote them, resolved through the dictionary); none when it asked for none or a word places nothing. */
async function askedNames(card: SharedCard): Promise<DimValues> {
  const parsed = dimFiltersSchema.safeParse(card.reads[0]?.input.filters ?? {});
  if (!parsed.success) return {};
  const dictionary = await loadDictionary();
  const resolved = resolveFilters(dictionary, parsed.data);
  return resolved.ok ? namesOf(dictionary, resolved.filters) : {};
}

/** A matter's title: the card's name with the agent, brand or region it is about ("มูลค่าขายเข้า · ขอนแก่นมหาชัย"). */
export async function matterTitle(card: SharedCard): Promise<string> {
  return shareTitle(card, await askedNames(card));
}

/** What a matter's card is about, in Thai ("ภาคอีสาน · ลีโอ"); null for a card over everything. */
export async function matterSubject(card: SharedCard): Promise<string | null> {
  return shareSubject(card, await askedNames(card));
}
