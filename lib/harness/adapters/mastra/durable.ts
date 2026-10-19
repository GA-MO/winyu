import type { Agent } from "@mastra/core/agent";
import { DurableAgent } from "@mastra/core/agent/durable";

const PERSISTED_STATUSES: ReadonlySet<string> = new Set(["pending", "paused", "suspended", "running"]);
const SUSPENDING_CHUNKS: ReadonlySet<string> = new Set(["tool-call-approval", "tool-call-suspended"]);
const TOOL_CALL_CHUNKS: ReadonlySet<string> = new Set(["tool-call-input-streaming-start", "tool-call-delta", "tool-call-input-streaming-end", "tool-call"]);
const ABANDONING_CHUNKS: ReadonlySet<string> = new Set(["step-start", "error"]);

type StreamArgs = Parameters<DurableAgent["stream"]>;

type StreamResult = Awaited<ReturnType<DurableAgent["stream"]>>;

type Chunk = { type: string; payload?: unknown };

type ErrorPayload = { error?: unknown };

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

function textOfError(error: unknown): unknown {
  if (typeof error !== "object" || error === null || error instanceof Error) return error;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (typeof message !== "string") return error;
  return typeof name === "string" && name ? `${name}: ${message}` : message;
}

/** Error chunks with their error as text: a run's error crosses Mastra's workflow as a plain object, which the AG-UI bridge would print as "[object Object]", so the person and the trace could not tell a timeout from any other failure. */
function withReadableErrors(source: ReadableStream<Chunk>): ReadableStream<Chunk> {
  return source.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        if (chunk.type !== "error") return controller.enqueue(chunk);
        const payload = (chunk.payload ?? {}) as ErrorPayload;
        controller.enqueue({ ...chunk, payload: { ...payload, error: textOfError(payload.error) } });
      },
    }),
  );
}

/** Tool calls held until the model step that asked for them is known to stand: a step that times out or fails is retried on the next model, which asks again under new ids, and Mastra never runs the abandoned calls, so the person must not see them start either. A call is let through with the next chunk that is not part of a new attempt (the step's finish, a result, an approval), so nothing that runs is delayed past its own step. */
function withoutAbandonedCalls(source: ReadableStream<Chunk>): ReadableStream<Chunk> {
  let held: Chunk[] = [];
  return source.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        if (TOOL_CALL_CHUNKS.has(chunk.type)) {
          held.push(chunk);
          return;
        }
        if (!ABANDONING_CHUNKS.has(chunk.type)) held.forEach((call) => controller.enqueue(call));
        held = [];
        controller.enqueue(chunk);
      },
      flush(controller) {
        held.forEach((call) => controller.enqueue(call));
      },
    }),
  );
}

/** The run's stream as the AG-UI bridge should read it: errors as text, and no tool call of a model step that was abandoned for the fallback. */
function forBridge(source: ReadableStream<Chunk>): ReadableStream<Chunk> {
  return withoutAbandonedCalls(withReadableErrors(source));
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
    const result = await super.stream(messages, { ...options, closeOnSuspend: true });
    return { ...result, fullStream: forBridge(result.fullStream) };
  }

  private async recoverUntilPaused(runId: string, abortSignal: AbortSignal | undefined): Promise<StreamResult> {
    const paused = Promise.withResolvers<void>();
    const recovered = await this.recover(runId, { abortSignal, onSuspended: () => paused.resolve() });
    const fullStream = forBridge(endingAtSuspension(recovered.fullStream, paused.promise));
    const { output, threadId, resourceId, cleanup, abort } = recovered;
    return { output, fullStream, runId, threadId, resourceId, cleanup, abort };
  }
}

/** The durable chat agent as the plain `Agent` the AG-UI bridge is typed for; it is one at runtime (DurableAgent extends Agent), only its narrower `generate` options keep TypeScript from seeing that. */
export function asBridgeAgent(agent: ChatDurableAgent): Agent {
  return agent as unknown as Agent;
}
