const SEGMENTER = new Intl.Segmenter("th", { granularity: "word" });
const K1 = 1.2;
const B = 0.75;
const STOPWORDS: ReadonlySet<string> = new Set([
  "ได้", "ไหม", "มั้ย", "หรือ", "ไม่", "ครับ", "ค่ะ", "คะ", "นะ", "จ้ะ", "จ๊ะ", "อะไร", "ยังไง", "อย่างไร", "เท่าไหร่", "เท่าไร", "กี่", "ที่", "ของ", "การ", "มี", "เป็น", "ให้",
  "และ", "กับ", "ใน", "จะ", "ต้อง", "ก็", "แล้ว", "ว่า", "บ้าง", "ไป", "มา", "คือ", "นี้", "นั้น", "เรา", "ผม", "ฉัน", "หนู", "ดิฉัน", "เขา", "ถ้า", "เมื่อ", "หรือไม่", "ไหน", "the", "a", "of",
]);

/** The words of a text a keyword search counts: Thai split into words by the platform's segmenter, lower-cased, stopwords and particles dropped. */
export function wordsOf(text: string): string[] {
  const words: string[] = [];
  for (const part of SEGMENTER.segment(text.toLowerCase())) {
    if (!part.isWordLike) continue;
    const word = part.segment.trim();
    if (word.length > 0 && !STOPWORDS.has(word)) words.push(word);
  }
  return words;
}

type Counted = { id: string; length: number; counts: Map<string, number> };

/** One item's BM25 score for a query. */
export type KeywordHit = { id: string; score: number };

/** BM25 over the given items only: the caller decides which items may be searched before this sees any of them. */
export function keywordSearch(items: readonly { id: string; text: string }[], query: string, limit: number): KeywordHit[] {
  const terms = [...new Set(wordsOf(query))];
  if (terms.length === 0 || items.length === 0) return [];
  const counted: Counted[] = items.map((item) => {
    const counts = new Map<string, number>();
    const words = wordsOf(item.text);
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    return { id: item.id, length: words.length, counts };
  });
  const averageLength = counted.reduce((sum, item) => sum + item.length, 0) / counted.length;
  const idf = new Map(terms.map((term) => {
    const holding = counted.filter((item) => item.counts.has(term)).length;
    return [term, Math.log(1 + (counted.length - holding + 0.5) / (holding + 0.5))];
  }));
  return counted
    .map((item) => ({
      id: item.id,
      score: terms.reduce((sum, term) => {
        const frequency = item.counts.get(term) ?? 0;
        if (frequency === 0) return sum;
        return sum + (idf.get(term) ?? 0) * ((frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * item.length) / averageLength)));
      }, 0),
    }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
