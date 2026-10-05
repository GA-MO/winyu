import type { Agent } from "@mastra/core/agent";
import { DurableAgent } from "@mastra/core/agent/durable";

const PERSISTED_STATUSES: ReadonlySet<string> = new Set(["pending", "paused", "suspended", "running"]);

type StreamArgs = Parameters<DurableAgent["stream"]>;

const recovering = new Set<string>();

/** Marks a run id so the next stream the AG-UI bridge opens for it continues the run Mastra checkpointed instead of starting a new one. */
export function recoverOnNextStream(runId: string): void {
  recovering.add(runId);
}

/** Every run snapshot is kept, `running` included, so a run cut off by a restart can be found and driven on; Mastra's default keeps only paused and suspended ones unless its own auto-recovery is on, which would re-drive runs outside the person's access and harness run. */
export function persistsSnapshot({ workflowStatus }: { workflowStatus: string }): boolean {
  return PERSISTED_STATUSES.has(workflowStatus);
}

/** The chat agent as a Mastra durable agent, shaped for the AG-UI bridge: the stream ends when the run pauses for an approval (the bridge turns that into an interrupt), and a run marked for recovery continues from its last checkpoint. */
export class ChatDurableAgent extends DurableAgent {
  override async stream(...[messages, options]: StreamArgs) {
    const runId = options?.runId;
    if (runId && recovering.delete(runId)) return this.recover(runId, { abortSignal: options?.abortSignal });
    return super.stream(messages, { ...options, closeOnSuspend: true });
  }
}

/** The durable chat agent as the plain `Agent` the AG-UI bridge is typed for; it is one at runtime (DurableAgent extends Agent), only its narrower `generate` options keep TypeScript from seeing that. */
export function asBridgeAgent(agent: ChatDurableAgent): Agent {
  return agent as unknown as Agent;
}
