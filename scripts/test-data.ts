import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PAID_MODEL_KEYS = ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"];

/** Drops the keys Bun loads from `.env.local`, so no test (nor the memory or digest job a chat turn starts) ever calls a paid model; every port stays on the in-process generator, never a network MCP. */
export function withoutPaidModels(): void {
  for (const key of PAID_MODEL_KEYS) delete process.env[key];
}

/** Swaps the local embedding model for the trigram embedder, so no test loads or downloads a model. */
export async function withoutEmbeddingModel(): Promise<void> {
  const { useEmbedder } = await import("../lib/server/recall/embedder");
  const { TRIGRAM_EMBEDDER } = await import("../lib/server/recall/trigram-embedder");
  useEmbedder(TRIGRAM_EMBEDDER);
}

/** Points the JSON store at a fresh seeded data folder, so tests never read what a walk left in `.data` nor write to real personas. */
export async function isolateTestData(): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "winyu-test-data-"));
  process.env.WINYU_DATA_DIR = dir;
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  const { ensureDemoStory } = await import("../lib/server/demo-story");
  const { ensureFeedHistory } = await import("../lib/server/demo-feed-history");
  await ensureDemoStory();
  await ensureFeedHistory();
  return dir;
}
