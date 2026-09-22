export const DATA_SEED = 20260922;

/** Seeded 32-bit PRNG; the only source of randomness in the generator. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixString(hash: number, text: string): number {
  let next = hash;
  for (let index = 0; index < text.length; index += 1) {
    next = Math.imul(next ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return next >>> 0;
}

function mixNumber(hash: number, value: number): number {
  let next = (hash ^ (value | 0)) >>> 0;
  next = Math.imul(next, 0x01000193) >>> 0;
  next = (next ^ (next >>> 13)) >>> 0;
  return next >>> 0;
}

/** Stable 0..1 noise for a key tuple; same tuple always yields the same value. */
export function hashNoise(...keys: (string | number)[]): number {
  let hash = DATA_SEED >>> 0;
  for (const key of keys) {
    hash = typeof key === "string" ? mixString(hash, key) : mixNumber(hash, key);
    hash = (hash ^ (hash >>> 16)) >>> 0;
  }
  hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** Symmetric noise around 1 with the given amplitude. */
export function jitter(amplitude: number, ...keys: (string | number)[]): number {
  return 1 + (hashNoise(...keys) - 0.5) * 2 * amplitude;
}

export function pick<T>(items: readonly T[], ...keys: (string | number)[]): T {
  const index = Math.min(items.length - 1, Math.floor(hashNoise(...keys) * items.length));
  return items[index] as T;
}
