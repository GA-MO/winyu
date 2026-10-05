const HONORIFIC = /^(คุณ|khun\s|k\.)\s*/i;
const WORD_GAP = /\s+/;
const MIN_PARTIAL_NAME = 2;

/** A colleague as recipient matching reads them: the id, the Thai name with its honorific, the English name and the job title when known. */
export type Named = { id: string; nameTh: string; name?: string; title?: string };

/** How one name the person typed resolves among the people a card can be shared with; nobody is guessed when a name fits several. */
export type RecipientMatch<Person extends Named> =
  | { asked: string; kind: "found"; person: Person }
  | { asked: string; kind: "ambiguous"; candidates: Person[] }
  | { asked: string; kind: "unknown" };

function bare(text: string): string {
  return text.trim().replace(HONORIFIC, "").trim().toLowerCase();
}

function fullNames(person: Named): string[] {
  return [bare(person.nameTh), ...(person.name ? [person.name.toLowerCase()] : [])];
}

function firstNames(person: Named): string[] {
  return fullNames(person).map((name) => name.split(WORD_GAP)[0]);
}

const TIERS: readonly ((person: Named, needle: string) => boolean)[] = [
  (person, needle) => person.id.toLowerCase() === needle,
  (person, needle) => fullNames(person).includes(needle),
  (person, needle) => firstNames(person).includes(needle),
  (person, needle) => needle.length >= MIN_PARTIAL_NAME && fullNames(person).some((name) => name.includes(needle)),
  (person, needle) => needle.length >= MIN_PARTIAL_NAME && (person.title ?? "").toLowerCase().includes(needle),
];

/** Resolves one typed name, closest fit first: the id, the whole name, the first name, part of a name, then the job title; the first kind of fit that finds anyone decides, so "นก" is คุณนก and not คุณกนก. */
export function matchRecipient<Person extends Named>(asked: string, people: readonly Person[]): RecipientMatch<Person> {
  const needle = bare(asked);
  if (!needle) return { asked, kind: "unknown" };
  for (const fits of TIERS) {
    const found = people.filter((person) => fits(person, needle));
    if (found.length === 1) return { asked, kind: "found", person: found[0] };
    if (found.length > 1) return { asked, kind: "ambiguous", candidates: found };
  }
  return { asked, kind: "unknown" };
}

/** Every typed name resolved against the same people. */
export function matchRecipients<Person extends Named>(asked: readonly string[], people: readonly Person[]): RecipientMatch<Person>[] {
  return asked.map((name) => matchRecipient(name, people));
}

/** The people every name found, each once; null when any name is unknown or fits several people. */
export function resolvedPeople<Person extends Named>(matches: readonly RecipientMatch<Person>[]): Person[] | null {
  const people = new Map<string, Person>();
  for (const match of matches) {
    if (match.kind !== "found") return null;
    people.set(match.person.id, match.person);
  }
  return [...people.values()];
}

/** Whether a typed name points at this person on its own: a people lookup that found the recipient was a means to an action, not the answer. */
export function namesPerson(asked: string, person: Named): boolean {
  return matchRecipient(asked, [person]).kind === "found";
}
