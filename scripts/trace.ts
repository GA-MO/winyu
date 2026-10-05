import { runStore } from "@/lib/harness/runtime";
import { stateOf } from "@/lib/harness/state";
import { studioTraceUrl, traceIdOfRun } from "@/lib/harness/trace-link";

const USAGE = "bun run trace [runId]   (no id: the latest run)";

function latestId(): string | null {
  const runs = runStore().all().sort((left, right) => right.endedAt.localeCompare(left.endedAt));
  return runs[0]?.id ?? null;
}

const runId = process.argv[2] ?? latestId();
const record = runId ? runStore().get(runId) : null;
if (!record) {
  console.error(runId ? `no run ${runId}` : "no runs yet");
  console.error(USAGE);
  process.exit(1);
}

console.log(`run ${record.id} · ${record.userId} · thread ${record.threadId ?? "-"} · ${record.startedAt} → ${record.endedAt}`);
console.log(`mastra trace ${traceIdOfRun(record.id)} · ${studioTraceUrl(record.id) ?? "Studio is not available in production"}`);
for (const event of record.events) {
  console.log(`${event.at.slice(11, 23)}  ${event.source.padEnd(7)} ${event.type.padEnd(22)} ${JSON.stringify(event.payload)}`);
}
const state = stateOf(record.id, record.events);
console.log(`\nphase ${state.phase} · goal ${state.goal?.status ?? "-"} · steps ${state.step} · tool calls ${Object.keys(state.toolCalls).length} · errors ${state.errors.join(", ") || "none"}`);
