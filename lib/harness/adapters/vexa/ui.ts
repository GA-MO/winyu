import { specOf } from "@/lib/eval/spec-of";

const DATA_LINE = "data: ";
const DONE = "[DONE]";

type StreamPart = Record<string, unknown> & { type?: unknown };

/** What a finished reply showed the person: the cards it drew, the approvals it asked for, and the error it ended on, if any. */
export type ReplySeen = { components: string[]; approvalsAsked: { approvalId: string; toolCallId: string; tool: string }[]; error: string | null };

function componentsOf(parts: StreamPart[]): string[] {
  const spec = specOf(parts) as { elements?: Record<string, { type?: unknown }> } | null;
  return Object.values(spec?.elements ?? {}).flatMap((element) => (typeof element?.type === "string" ? [element.type] : []));
}

function seenOf(parts: StreamPart[]): ReplySeen {
  const toolNames = new Map<string, string>();
  for (const part of parts) if (part.type === "tool-input-available" || part.type === "tool-input-start") toolNames.set(String(part.toolCallId), String(part.toolName));
  const approvalsAsked = parts
    .filter((part) => part.type === "tool-approval-request")
    .map((part) => ({ approvalId: String(part.approvalId), toolCallId: String(part.toolCallId), tool: toolNames.get(String(part.toolCallId)) ?? "unknown" }));
  const error = parts.find((part) => part.type === "error");
  return { components: componentsOf(parts), approvalsAsked, error: error ? String(error.errorText ?? "error") : null };
}

function partsOfLines(lines: string[]): StreamPart[] {
  return lines.flatMap((line) => {
    if (!line.startsWith(DATA_LINE) || line.slice(DATA_LINE.length).trim() === DONE) return [];
    try {
      return [JSON.parse(line.slice(DATA_LINE.length)) as StreamPart];
    } catch {
      return [];
    }
  });
}

/** Passes Vexa's UI message stream through to the browser unchanged and, once it ends, reports what the reply showed. */
export function observeReply(response: Response, onEnd: (seen: ReplySeen) => void): Response {
  if (!response.body) {
    onEnd({ components: [], approvalsAsked: [], error: response.ok ? null : `HTTP ${response.status}` });
    return response;
  }
  const decoder = new TextDecoder();
  const parts: StreamPart[] = [];
  let pending = "";
  const tap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      parts.push(...partsOfLines(lines));
      controller.enqueue(chunk);
    },
    flush() {
      parts.push(...partsOfLines([pending]));
      onEnd(seenOf(parts));
    },
  });
  return new Response(response.body.pipeThrough(tap), { status: response.status, statusText: response.statusText, headers: response.headers });
}
