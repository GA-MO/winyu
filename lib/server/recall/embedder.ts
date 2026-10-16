import type { Embedder } from "./types";

/** How one OpenRouter embedding model is called: its vector size and the prefixes it expects on a question and on a stored text. */
export type EmbeddingSpec = { modelId: string; dimension: number; queryPrefix: string; passagePrefix: string };

/** The model recall indexes and searches with. */
export const RECALL_EMBEDDING: EmbeddingSpec = { modelId: "intfloat/multilingual-e5-large", dimension: 1024, queryPrefix: "query: ", passagePrefix: "passage: " };

async function embed(spec: EmbeddingSpec, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const [{ embedMany }, { embeddingModel }, { recordEmbedding }] = await Promise.all([import("ai"), import("@/lib/server/models"), import("@/lib/server/usage-meter")]);
  const model = embeddingModel(spec.modelId);
  if (!model) throw new Error("recall needs OPENROUTER_API_KEY to embed");
  const result = await embedMany({ model, values: texts });
  recordEmbedding(spec.modelId, result.usage.tokens, result.providerMetadata);
  return result.embeddings;
}

/** An embedder that calls one OpenRouter embedding model; every call is metered into the model ledger. */
export function openRouterEmbedder(spec: EmbeddingSpec): Embedder {
  return {
    id: spec.modelId,
    dimension: spec.dimension,
    passages: (texts) => embed(spec, texts.map((text) => `${spec.passagePrefix}${text}`)),
    query: async (text) => (await embed(spec, [`${spec.queryPrefix}${text}`]))[0] ?? [],
  };
}

const RECALL_EMBEDDER = openRouterEmbedder(RECALL_EMBEDDING);

let override: Embedder | null = null;

/** Replaces the embedder for this process (tests use a deterministic one); null restores the OpenRouter model. */
export function useEmbedder(embedder: Embedder | null): void {
  override = embedder;
}

/** The embedder recall indexes and searches with. */
export function currentEmbedder(): Embedder {
  return override ?? RECALL_EMBEDDER;
}
