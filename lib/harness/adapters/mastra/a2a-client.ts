import { A2AAgent } from "@mastra/core/a2a";
import type { Message, Part, Task } from "@mastra/core/a2a";

/** Where a remote agent lives and how Winyu presents itself to it. */
export type RemoteAgent = { cardUrl: string; headers: Record<string, string>; timeoutMs: number };

/** What a remote agent said: its text and the structured rows it attached, both untrusted until the caller fences them. */
export type RemoteAnswer = { text: string; data: Record<string, unknown>[] };

function partsOf(result: { task?: Task; message?: Message }): Part[] {
  const fromTask = (result.task?.artifacts ?? []).flatMap((artifact) => artifact.parts);
  return fromTask.length > 0 ? fromTask : (result.message?.parts ?? []);
}

/** Asks a remote A2A agent one question through Mastra's `A2AAgent` (card fetched and checked, `message/send`), and returns its text and data parts. */
export async function askRemoteAgent(remote: RemoteAgent, question: string): Promise<RemoteAnswer> {
  const agent = new A2AAgent({ url: remote.cardUrl, headers: remote.headers, timeoutMs: remote.timeoutMs, retries: 0 });
  const result = await agent.generate(question);
  const parts = partsOf(result);
  const text = parts.flatMap((part) => (part.kind === "text" ? [part.text] : [])).join("\n") || result.text;
  const data = parts.flatMap((part) => (part.kind === "data" ? [part.data] : []));
  return { text, data };
}
