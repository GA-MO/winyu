import type { Agent } from "@mastra/core/agent";
import { DurableAgent } from "@mastra/core/agent/durable";

const PERSISTED_STATUSES: ReadonlySet<string> = new Set(["pending", "paused", "suspended", "running"]);
const SUSPENDING_CHUNKS: ReadonlySet<string> = new Set(["tool-call-approval", "tool-call-suspended"]);

type StreamArgs = Parameters<DurableAgent["stream"]>;

type StreamResult = Awaited<ReturnType<DurableAgent["stream"]>>;

type Chunk = { type: string };

function endingAtSuspension(source: ReadableStream<Chunk>, suspended: Promise<void>): ReadableStream<Chunk> {
  const ending = new TransformStream<Chunk, Chunk>({
    async transform(chunk, controller) {
      controller.enqueue(chunk);
      if (!SUSPENDING_CHUNKS.has(chunk.type)) return;
      await suspended;
      controller.terminate();
    },
  });
  return source.pipeThrough(ending, { preventCancel: true });
}

const recovering = new Set<string>();

/** Marks a run id so the next stream the AG-UI bridge opens for it continues the run Mastra checkpointed instead of starting a new one. */
export function recoverOnNextStream(runId: string): void {
  recovering.add(runId);
}

/** Every run snapshot is kept, `running` included, so a run cut off by a restart can be found and driven on; Mastra's default keeps only paused and suspended ones unless its own auto-recovery is on, which would re-drive runs outside the person's access and harness run. */
export function persistsSnapshot({ workflowStatus }: { workflowStatus: string }): boolean {
  return PERSISTED_STATUSES.has(workflowStatus);
}

/** The chat agent as a Mastra durable agent, shaped for the AG-UI bridge: the stream ends when the run pauses for an approval (the bridge turns that into an interrupt), and a run marked for recovery continues from its last checkpoint and ends the same way, since Mastra's recover keeps its stream open across a pause. */
export class ChatDurableAgent extends DurableAgent {
  override async stream(...[messages, options]: StreamArgs) {
    const runId = options?.runId;
    if (runId && recovering.delete(runId)) return this.recoverUntilPaused(runId, options?.abortSignal);
    return super.stream(messages, { ...options, closeOnSuspend: true });
  }

  private async recoverUntilPaused(runId: string, abortSignal: AbortSignal | undefined): Promise<StreamResult> {
    const paused = Promise.withResolvers<void>();
    const recovered = await this.recover(runId, { abortSignal, onSuspended: () => paused.resolve() });
    const fullStream = endingAtSuspension(recovered.fullStream, paused.promise);
    const { output, threadId, resourceId, cleanup, abort } = recovered;
    return { output, fullStream, runId, threadId, resourceId, cleanup, abort };
  }
}

/** The durable chat agent as the plain `Agent` the AG-UI bridge is typed for; it is one at runtime (DurableAgent extends Agent), only its narrower `generate` options keep TypeScript from seeing that. */
export function asBridgeAgent(agent: ChatDurableAgent): Agent {
  return agent as unknown as Agent;
}
