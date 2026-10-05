import { createDictionary, type Dictionary } from "@/lib/semantic/dictionary";
import { ports } from "@/lib/server/ports";
import type { MetricsPort } from "@/lib/server/ports/metrics";

const TTL_MS = 10 * 60_000;

type Cached = { port: MetricsPort; loadedAt: number; dictionary: Promise<Dictionary> };

let cached: Cached | null = null;

/** The dictionary over the warehouse's current master data, read through the metrics port and kept for ten minutes. */
export function loadDictionary(now = Date.now()): Promise<Dictionary> {
  const port = ports().metrics;
  if (cached && cached.port === port && now - cached.loadedAt < TTL_MS) return cached.dictionary;
  const loading = port.masterData().then(createDictionary);
  const entry: Cached = { port, loadedAt: now, dictionary: loading };
  cached = entry;
  loading.catch(() => {
    if (cached === entry) cached = null;
  });
  return loading;
}
