import { createDictionary, type Dictionary } from "@/lib/semantic/dictionary";
import { ports } from "@/lib/server/ports";
import type { MetricsPort } from "@/lib/server/ports/metrics";

const TTL_MS = 10 * 60_000;
const RETRY_MS = 30_000;

type Cached = { port: MetricsPort; expiresAt: number; dictionary: Promise<Dictionary> };

let cached: Cached | null = null;
let lastGood: { port: MetricsPort; dictionary: Dictionary } | null = null;

/** The dictionary over the warehouse's current master data, read through the metrics port and kept for ten minutes; when a refresh fails, the last one this port gave is served and the refresh is tried again shortly. */
export function loadDictionary(now = Date.now()): Promise<Dictionary> {
  const port = ports().metrics;
  if (cached && cached.port === port && now < cached.expiresAt) return cached.dictionary;
  const previous = lastGood?.port === port ? lastGood.dictionary : null;
  const loading = port.masterData().then(createDictionary).then(
    (dictionary) => {
      lastGood = { port, dictionary };
      return dictionary;
    },
    (error: unknown) => {
      if (cached === entry) cached = previous ? { ...entry, expiresAt: now + RETRY_MS } : null;
      if (previous) return previous;
      throw error;
    },
  );
  const entry: Cached = { port, expiresAt: now + TTL_MS, dictionary: loading };
  cached = entry;
  return loading;
}
