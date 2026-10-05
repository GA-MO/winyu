import os from "node:os";
import path from "node:path";
import type { Embedder } from "./types";

const MODEL_ID = "Xenova/multilingual-e5-base";
const MODEL_DTYPE = "q8";
const DIMENSION = 768;
const QUERY_PREFIX = "query: ";
const PASSAGE_PREFIX = "passage: ";
const MODEL_CACHE_DIR = path.join(os.homedir(), ".cache", "winyu", "models");
const POOLING = { pooling: "mean", normalize: true } as const;

type Extract = (texts: string[], options: typeof POOLING) => Promise<{ tolist(): unknown }>;

let loading: Promise<Extract> | null = null;

async function loadExtractor(): Promise<Extract> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = MODEL_CACHE_DIR;
  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: MODEL_DTYPE });
  return (texts, options) => extractor(texts, options);
}

async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  loading ??= loadExtractor();
  const tensor = await (await loading)(texts, POOLING);
  return tensor.tolist() as number[][];
}

const LOCAL_EMBEDDER: Embedder = {
  id: `${MODEL_ID}@${MODEL_DTYPE}`,
  dimension: DIMENSION,
  passages: (texts) => embed(texts.map((text) => `${PASSAGE_PREFIX}${text}`)),
  query: async (text) => (await embed([`${QUERY_PREFIX}${text}`]))[0] ?? [],
};

/** The local multilingual e5 embedder; the model loads on first use from the machine's model cache. */
export function localEmbedder(): Embedder {
  return LOCAL_EMBEDDER;
}

let override: Embedder | null = null;

/** Replaces the embedder for this process (tests use a deterministic one); null restores the local model. */
export function useEmbedder(embedder: Embedder | null): void {
  override = embedder;
}

/** The embedder recall indexes and searches with. */
export function currentEmbedder(): Embedder {
  return override ?? localEmbedder();
}
