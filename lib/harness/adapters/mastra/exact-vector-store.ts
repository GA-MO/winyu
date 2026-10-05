import { createClient } from "@libsql/client";
import { LibSQLVector } from "@mastra/libsql";

const BUSY_TIMEOUT_MS = 5000;

/** Where a vector index lives: the store id, the database URL and the index (table) name. */
export type VectorIndexLocation = { id: string; url: string; indexName: string };

/** Closes a store that created its index and reopens it without LibSQL's approximate DiskANN index, which loses rows after deletes, so every query and listing compares against every row. */
export async function reopenExact(setup: LibSQLVector, { id, url, indexName }: VectorIndexLocation): Promise<LibSQLVector> {
  await setup.close();
  const client = createClient({ url });
  try {
    await client.execute(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    await client.execute(`DROP INDEX IF EXISTS "${indexName}_vector_idx"`);
  } finally {
    client.close();
  }
  return new LibSQLVector({ id, url });
}
