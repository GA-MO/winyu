import { dimFiltersSchema, DIMS, type Dim, type DimValues } from "@/lib/contracts";
import { isTimeDim } from "@/lib/cards/rows";
import { namesOf, resolveFilters, type Dictionary } from "@/lib/semantic/dictionary";
import { loadDictionary } from "@/lib/server/master-data";
import { shareSubject, shareTitle, withFocus, type SharedCard, type SharedRead } from "@/lib/share/card";

/** The Thai names of the filters a read asked for (its words as the model wrote them, resolved through the dictionary); none when it asked for none or a word places nothing. */
function askedNames(read: SharedRead | undefined, dictionary: Dictionary): DimValues {
  const parsed = dimFiltersSchema.safeParse(read?.input.filters ?? {});
  if (!parsed.success) return {};
  const resolved = resolveFilters(dictionary, parsed.data);
  return resolved.ok ? namesOf(dictionary, resolved.filters) : {};
}

function splitDimOf(read: SharedRead): Dim | null {
  const dims = Array.isArray(read.input.dims) ? read.input.dims.filter((dim): dim is Dim => DIMS.includes(dim as Dim) && !isTimeDim(dim as Dim)) : [];
  return dims.length === 1 ? dims[0] : null;
}

/** The read a send is about: the one broken down by the dimension every singled-out row belongs to (a paired card sent about one agent is about its agent ranking, not its region rollup, AI-273); else the card's first read. */
function focusedRead(card: SharedCard, focus: readonly string[], dictionary: Dictionary): SharedRead {
  if (focus.length === 0) return card.reads[0];
  const about = card.reads.find((read) => {
    const dim = splitDimOf(read);
    return dim !== null && focus.every((label) => dictionary.resolveDimValue(dim, label) !== null);
  });
  return about ?? card.reads[0];
}

/** A matter's title: the name of the read the send is about with the agent, brand or region it is about ("มูลค่าขายเข้า · ขอนแก่นมหาชัย"), and the rows the sender singled out on it (`focus`) when the card does not already name them. */
export async function matterTitle(card: SharedCard, focus: readonly string[] = []): Promise<string> {
  const dictionary = await loadDictionary();
  const read = focusedRead(card, focus, dictionary);
  return withFocus(shareTitle(card, askedNames(read, dictionary), read), focus);
}

/** What a matter is about, in Thai ("ภาคอีสาน · ลีโอ", "ภาคอีสาน · ขอนแก่นมหาชัย" when the sender singled out an agent); null for a card over everything with nothing singled out. */
export async function matterSubject(card: SharedCard, focus: readonly string[] = []): Promise<string | null> {
  const dictionary = await loadDictionary();
  const read = focusedRead(card, focus, dictionary);
  return withFocus(shareSubject(card, askedNames(read, dictionary), read) ?? "", focus) || null;
}
