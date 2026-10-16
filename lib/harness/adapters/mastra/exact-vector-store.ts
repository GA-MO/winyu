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

/** One stored vector's id and metadata, read straight from the index table. */
export type StoredVector = { id: string; metadata: Record<string, unknown> };

/** Every row of an index, without its vector: what a re-embedding needs to rebuild it. */
export async function storedVectors({ url, indexName }: Omit<VectorIndexLocation, "id">): Promise<StoredVector[]> {
  const client = createClient({ url });
  try {
    const result = await client.execute(`SELECT vector_id, metadata FROM "${indexName}"`);
    return result.rows.map((row) => ({ id: String(row.vector_id), metadata: JSON.parse(String(row.metadata ?? "{}")) as Record<string, unknown> }));
  } finally {
    client.close();
  }
}
