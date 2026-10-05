import type { LanguageModelMiddleware } from "ai";
import { currentRun, emitTo, type Run } from "./runtime";

type FinishChunk = { type: "finish"; finishReason?: { unified?: string } | string };

function reasonOf(chunk: FinishChunk): string {
  const reason = chunk.finishReason;
  return typeof reason === "string" ? reason : (reason?.unified ?? "unknown");
}

function stepStarted(run: Run): string {
  run.steps += 1;
  const stepId = `${run.id}:${run.steps}`;
  emitTo(run, "model", { type: "agent.thinking", payload: { stepId, step: run.steps } });
  return stepId;
}

/** Records each model call of a run as one step: that it started, the tools it asked for, and how it finished. */
export function traceMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const run = currentRun();
      const stepId = run ? stepStarted(run) : null;
      const result = await doGenerate();
      if (!run || !stepId) return result;
      const toolCalls = result.content.flatMap((part) => (part.type === "tool-call" ? [part] : []));
      for (const call of toolCalls) emitTo(run, "model", { type: "agent.tool.requested", payload: { stepId, toolCallId: call.toolCallId, tool: call.toolName } });
      emitTo(run, "model", { type: "agent.decided", payload: { stepId, finishReason: reasonOf({ type: "finish", finishReason: result.finishReason }), toolCalls: toolCalls.map((call) => call.toolName) } });
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const run = currentRun();
      const stepId = run ? stepStarted(run) : null;
      const { stream, ...rest } = await doStream();
      if (!run || !stepId) return { stream, ...rest };
      const requested: string[] = [];
      const traced = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === "tool-call") {
              requested.push(chunk.toolName);
              emitTo(run, "model", { type: "agent.tool.requested", payload: { stepId, toolCallId: chunk.toolCallId, tool: chunk.toolName } });
            }
            if (chunk.type === "finish") emitTo(run, "model", { type: "agent.decided", payload: { stepId, finishReason: reasonOf(chunk as FinishChunk), toolCalls: requested } });
            controller.enqueue(chunk);
          },
        }),
      );
      return { stream: traced, ...rest };
    },
  };
}
