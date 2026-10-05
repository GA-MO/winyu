import type { Embedder } from "./types";

const DIMENSION = 64;
const GRAM = 3;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function bucketOf(gram: string): number {
  let hash = FNV_OFFSET;
  for (const char of gram) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME);
  return (hash >>> 0) % DIMENSION;
}

function vectorOf(text: string): number[] {
  const chars = [...text.toLowerCase().replace(/\s+/g, " ")];
  const vector = new Array<number>(DIMENSION).fill(0);
  for (let index = 0; index + GRAM <= chars.length; index += 1) vector[bucketOf(chars.slice(index, index + GRAM).join(""))] += 1;
  const norm = Math.hypot(...vector);
  if (norm === 0) return vector.map((_, index) => (index === 0 ? 1 : 0));
  return vector.map((value) => value / norm);
}

/** A deterministic embedder for tests: character trigrams hashed into 64 dimensions, so tests never load a model. */
export const TRIGRAM_EMBEDDER: Embedder = {
  id: "trigram-64",
  dimension: DIMENSION,
  passages: async (texts) => texts.map(vectorOf),
  query: async (text) => vectorOf(text),
};
