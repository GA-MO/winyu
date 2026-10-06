import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import type { ShareScope, User } from "@/lib/contracts";
import type { ComposedSurface } from "@/lib/compose/catalog";
import { CardComposer } from "@/lib/compose/composer";
import { emitTo, newRun, runWithRun, saveRun } from "@/lib/harness/runtime";
import type { SharedCard } from "@/lib/share/card";
import { winyuTools } from "@/lib/server/agent/tools";
import { shareScopeFor } from "@/lib/server/grants";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import type { Share } from "./shares";

/** One stored read run again as the viewer: what it was called with and what the gateway returned to them. */
export type FreshRead = { toolCallId: string; tool: string; input: Record<string, unknown>; result: unknown };

/** A share drawn for one viewer: the reads as they came back under the viewer's access, for a composed card the block re-checked against those results (null when none of it holds for them, so the fixed cards show instead), and what the card hides from them that the sender saw. */
export type SharedView = { reads: FreshRead[]; surface: ComposedSurface | null; scope: ShareScope | null };

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

async function rerun(card: SharedCard): Promise<FreshRead[]> {
  const tools = winyuTools();
  const reads: FreshRead[] = [];
  for (const read of card.reads) {
    const toolCallId = randomUUID();
    const output = await tools[read.tool].execute(read.input, { toolCallId });
    reads.push({ toolCallId, tool: read.tool, input: read.input, result: jsonSafe(output) });
  }
  return reads;
}

/** The stored block checked again, line by line, against the viewer's results: a line whose data their scope did not return is dropped like any composed line that fails. */
export function regrounded(card: SharedCard, reads: readonly FreshRead[], surfaceId: string): ComposedSurface | null {
  if (card.kind !== "composed") return null;
  const composer = new CardComposer(reads.map((read) => ({ tool: read.tool, output: read.result })));
  for (const component of card.components) composer.read(JSON.stringify(component));
  const outcome = composer.finish();
  return outcome.surface ? { surfaceId, components: outcome.surface.components, dataModel: outcome.surface.dataModel, done: true } : null;
}

/** Opens a share for one viewer: every stored read runs again through the gateway as that viewer (their scope, masking, rules and kill switches; one audit row each, initiator person) in a harness run of its own, and the card is drawn from those fresh results. */
export async function openShare(share: Share, viewer: User): Promise<SharedView> {
  const access = liveAccessFor(viewer);
  const run = newRun(viewer.id, null, { initiator: "person" });
  const question = share.question ?? share.title;
  emitTo(run, "runtime", { type: "agent.started", payload: { goal: { id: run.id, userMessage: question, intent: "share", status: "active" }, userId: viewer.id, threadId: null } });
  const turn = { turnId: run.id, threadId: null, preloadPacketId: null, question, queries: [] };
  try {
    const reads = await runWithAccess(access, () => runWithTurn(turn, () => runWithRun(run, () => rerun(share.card))));
    emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: "done" } });
    return { reads, surface: regrounded(share.card, reads, `share:${share.id}`), scope: shareScopeFor(share, viewer) };
  } finally {
    saveRun(run);
  }
}
