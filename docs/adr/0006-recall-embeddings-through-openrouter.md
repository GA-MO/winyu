# 0006. Recall embeddings go through OpenRouter

Accepted, 2026-10-16. Replaces the consequence of 0002 that kept the local e5 embedder.

## Context

Conversation recall (F6) embedded each turn's question and reply with `Xenova/multilingual-e5-base` on the server's CPU, through `@huggingface/transformers`. The model and its runtime made up most of the demo image: `onnxruntime-node` 287 MB, of which the linux/x64 binary GKE uses is 45 MB, `onnxruntime-web` 136 MB, which only a browser uses, and the model itself 283 MB. The build stage ran `scripts/warm-embedder.ts` to download and load the model, which took 1.3 GB of memory on top of Kaniko's own snapshots. The pod also loaded the model on the first chat.

The pod already calls OpenRouter for the chat model, so an embedding call adds no new destination.

## Decision

Recall embeds through OpenRouter's embeddings API with `intfloat/multilingual-e5-large` (1024 dimensions), defined as `RECALL_EMBEDDING` in `lib/server/recall/embedder.ts`. Each call is recorded in the model ledger with the cost OpenRouter billed. `@huggingface/transformers` and `scripts/warm-embedder.ts` are removed.

`bun run memory:bench --embedders=…` compared four models on 38 questions over the 63 recorded conversations, for $0.0024 in total. e5-large found the right thread in its top three for 38 of 38. `baai/bge-m3` also found 38. `qwen/qwen3-embedding-8b` and `google/gemini-embedding-001` found 37. e5-large costs $0.01 per million tokens, the lowest price among them. It also keeps the `query:` and `passage:` prefixes of the model it replaces. The table is in `docs/memory.md`.

An index built for another vector size is re-embedded from its stored texts when it first opens (`prepareRecallIndex`). The new vectors are computed before the old index is dropped, so a failed call leaves the old index as it was. `.data/mastra.db` and `deploy/seed-data/mastra.db` were re-embedded this way: 46 vectors each, $0.000026 each.

## Consequences

- The image is 2.59 GB instead of 3.73 GB. The build no longer needs `huggingface.co`. Kaniko, with the flags in `.gitlab-ci.yml`, peaked at 2.19 GB instead of 2.64 GB.
- The pod used 351 MiB after a chat turn that called `recall_memory`. It used 446 MiB with the local model.
- The question and the reply text of every turn go to OpenRouter and the provider it routes to (DeepInfra in our calls). The chat text already took that route. Numbers are not masked at that point.
- A turn that calls `recall_memory` waits about 1.2 to 2.3 seconds for its query embedding. It waited 25 to 45 milliseconds with the local model. Indexing runs after the reply, so the person does not wait for it.
- Indexing one turn costs about 80 tokens, under $0.000001. Without `OPENROUTER_API_KEY`, recall cannot embed and turns are not indexed.
- Tests keep the trigram embedder and never call the API.
