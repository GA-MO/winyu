import type { MemoryFact } from "@/lib/contracts";
import { METRIC_LIST } from "@/lib/semantic/metrics";

const SAME_FACT_SIMILARITY = 0.4;
const GRAM_SIZE = 3;
const MIN_ANCHOR_LENGTH = 3;
const SPELLING_VARIANTS: [RegExp, string][] = [[/สต็อก/g, "สต๊อก"]];
const PUNCTUATION = /[\s"'“”‘’().,:;/\-–]/g;
const QUOTED = /["'“”‘’]([^"'“”‘’]{2,40})["'“”‘’]/g;
const FILLER_WORDS = [
  "ให้ความสนใจกับ", "สนใจ", "ชอบเรียกดู", "ชอบดู", "ชอบ", "ต้องการดู", "ต้องการ",
  "ดูแลหรือติดตาม", "ดูแลและติดตาม", "ติดตามหรือดูแล", "ติดตามและ", "ติดตาม", "ดูแลหรือรับผิดชอบ", "ดูแล", "รับผิดชอบ", "มีหน้าที่",
  "ใช้คำศัพท์เฉพาะ", "ใช้คำศัพท์", "ใช้คำเรียก", "ใช้คำว่า", "เรียก",
  "ข้อมูล", "เป็นประจำ", "อยู่เสมอ", "รูปแบบ", "ลักษณะ", "แบบ", "ในการ", "สำหรับ", "เมื่อ", "เพื่อ",
  "การ", "และ", "หรือ", "ของ", "ว่า", "เช่น", "ที่",
];

type Anchor = { id: string; word: string };

const METRIC_ANCHORS: Anchor[] = (() => {
  const owners = new Map<string, number>();
  for (const def of METRIC_LIST) for (const word of def.synonyms) owners.set(word.toLowerCase(), (owners.get(word.toLowerCase()) ?? 0) + 1);
  return METRIC_LIST.flatMap((def) =>
    [def.labelTh.replace(/\s*\(.*\)$/, ""), ...def.synonyms]
      .map((word) => word.toLowerCase())
      .filter((word) => word.length >= MIN_ANCHOR_LENGTH && (owners.get(word) ?? 0) <= 1)
      .map((word) => ({ id: def.id, word })),
  ).sort((left, right) => right.word.length - left.word.length);
})();

function comparable(value: string): string {
  let text = value.toLowerCase();
  for (const [pattern, replacement] of SPELLING_VARIANTS) text = text.replace(pattern, replacement);
  text = text.replace(PUNCTUATION, "");
  for (const word of FILLER_WORDS) text = text.split(word).join("");
  return text;
}

function grams(text: string): Set<string> {
  if (text.length <= GRAM_SIZE) return new Set([text]);
  const found = new Set<string>();
  for (let index = 0; index + GRAM_SIZE <= text.length; index += 1) found.add(text.slice(index, index + GRAM_SIZE));
  return found;
}

function dice(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

/** What a fact is about that a paraphrase must keep: the metrics it names and the words it quotes. */
export function anchorsOf(value: string): Set<string> {
  const lower = value.toLowerCase();
  const anchors = new Set<string>();
  let rest = lower;
  for (const anchor of METRIC_ANCHORS) {
    if (!rest.includes(anchor.word)) continue;
    anchors.add(`metric:${anchor.id}`);
    rest = rest.split(anchor.word).join(" ");
  }
  for (const match of lower.matchAll(QUOTED)) anchors.add(`word:${(match[1] ?? "").trim()}`);
  return anchors;
}

function eachHasItsOwn(left: Set<string>, right: Set<string>): boolean {
  const leftOnly = [...left].some((anchor) => !right.has(anchor));
  const rightOnly = [...right].some((anchor) => !left.has(anchor));
  return leftOnly && rightOnly;
}

/** How alike two fact texts read, 0..1, after the filler words that every paraphrase adds are removed. */
export function similarity(left: string, right: string): number {
  return dice(grams(comparable(left)), grams(comparable(right)));
}

/** Whether two facts say the same thing: same type, alike wording, and no metric or quoted word that one has and the other lacks on both sides. */
export function isSameFact(left: Pick<MemoryFact, "type" | "value">, right: Pick<MemoryFact, "type" | "value">): boolean {
  if (left.type !== right.type) return false;
  if (left.value.trim() === right.value.trim()) return true;
  if (eachHasItsOwn(anchorsOf(left.value), anchorsOf(right.value))) return false;
  return similarity(left.value, right.value) >= SAME_FACT_SIMILARITY;
}

/** The known fact a new one repeats, preferring the most confident. */
export function findSameFact<T extends Pick<MemoryFact, "type" | "value" | "confidence">>(known: T[], fact: Pick<MemoryFact, "type" | "value">): T | null {
  return [...known].sort((left, right) => right.confidence - left.confidence).find((candidate) => isSameFact(candidate, fact)) ?? null;
}

/** Facts grouped so each group says one thing; the first of a group is its most confident member. */
export function clusterFacts<T extends Pick<MemoryFact, "type" | "value" | "confidence">>(facts: T[]): T[][] {
  const groups: T[][] = [];
  for (const fact of [...facts].sort((left, right) => right.confidence - left.confidence)) {
    const home = groups.find((group) => isSameFact(group[0] as T, fact));
    if (home) home.push(fact);
    else groups.push([fact]);
  }
  return groups;
}
