import path from "node:path";
import { Database } from "bun:sqlite";
import { onlyRecalled } from "@/lib/harness/adapters/mastra/learn";
import { forgetTurns, indexedTurns, type IndexedTurn } from "@/lib/harness/adapters/mastra/recall";
import { traceIdOfRun } from "@/lib/harness/trace-link";
import { DATA_DIR } from "@/lib/server/store/json-store";

const USAGE = `usage: bun run recall:prune [--apply]
  Finds the turns in the recall index that called only recall_memory, indexed before AI-345 stopped indexing them,
  from the tool calls stored in .data/mastra.db; lists them, and with --apply takes them out of recall.
  A turn whose messages are not stored is kept. Running it again finds nothing. Run it before make demo-build.`;

type ToolRow = { traceId: string | null; tool: string | null };

/** The tools each run's reply called, by the Mastra trace id its assistant messages carry; a reply that called none maps to an empty list. */
function toolsByTrace(db: Database): Map<string, string[]> {
  const rows = db
    .query(
      `select json_extract(m.content, '$.metadata.traceId') traceId, json_extract(p.value, '$.toolInvocation.toolName') tool
       from mastra_messages m left join json_each(json_extract(m.content, '$.parts')) p on json_extract(p.value, '$.type') = 'tool-invocation'
       where m.role = 'assistant'`,
    )
    .all() as ToolRow[];
  const byTrace = new Map<string, string[]>();
  for (const { traceId, tool } of rows) {
    if (!traceId) continue;
    const tools = byTrace.get(traceId) ?? [];
    byTrace.set(traceId, tool ? [...new Set([...tools, tool])] : tools);
  }
  return byTrace;
}

function recallOnlyTurns(turns: readonly IndexedTurn[], byTrace: ReadonlyMap<string, string[]>): { recallOnly: IndexedTurn[]; unknown: number } {
  const recallOnly: IndexedTurn[] = [];
  let unknown = 0;
  for (const turn of turns) {
    const tools = byTrace.get(traceIdOfRun(turn.turnId));
    if (!tools) unknown += 1;
    else if (onlyRecalled(tools)) recallOnly.push(turn);
  }
  return { recallOnly, unknown };
}

if (process.argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}

const apply = process.argv.includes("--apply");
const db = new Database(path.join(DATA_DIR, "mastra.db"), { readonly: true });
const turns = await indexedTurns();
const { recallOnly, unknown } = recallOnlyTurns(turns, toolsByTrace(db));
db.close();
console.log(`${turns.length} turns in recall · ${recallOnly.length} called only recall_memory · ${unknown} without stored messages (kept)`);
for (const turn of recallOnly) console.log(`  ${turn.userId} · thread ${turn.threadId} · turn ${turn.turnId} · «${turn.question}»`);
if (recallOnly.length === 0) process.exit(0);
if (!apply) {
  console.log("dry run: nothing deleted; run with --apply to take these turns out of recall");
  process.exit(0);
}
await forgetTurns(recallOnly.map((turn) => turn.turnId));
console.log(`took ${recallOnly.length} turns out of recall`);
