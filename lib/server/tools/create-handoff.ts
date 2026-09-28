import type { z } from "zod";
import { createHandoffInputSchema, type MetricQuery } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { createPacket, digestOf } from "@/lib/server/handoff";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { threads } from "@/lib/server/threads-read";
import { defineTool } from "./define";
import { ALL_BUT_SALES_REP, recipient } from "./shared";

const MAX_EVIDENCE = 4;

function evidenceKey(query: { metric: string; filters: unknown; range: { from: string; to: string } }): string {
  return `${query.metric}|${JSON.stringify(query.filters)}|${query.range.from}|${query.range.to}`;
}

function mergeEvidence(explicit: MetricQuery[], ran: MetricQuery[]): MetricQuery[] {
  const merged = new Map<string, MetricQuery>();
  for (const query of [...explicit, ...ran]) merged.set(evidenceKey(query), query);
  return [...merged.values()].slice(0, MAX_EVIDENCE);
}

function textOf(message: unknown): string {
  const parts = (message as { parts?: { type?: string; text?: string }[] })?.parts ?? [];
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join(" ").trim();
}

function digestOfThread(threadId: string | null): string {
  if (!threadId) return "";
  const thread = threads().get(threadId);
  if (!thread) return "";
  return digestOf(thread.messages.map((message) => ({ role: (message as { role?: string }).role ?? "assistant", text: textOf(message) })));
}

function suggestedActionsFor(ask: string): string[] {
  return [TH.handoff.replies.accept, TH.handoff.replies.need_info, `ตรวจ: ${ask}`];
}

export const createHandoffTool = defineTool({
  name: "create_handoff",
  connector: "winyu",
  tier: "write",
  roles: ALL_BUT_SALES_REP,
  description: "Hand this question over to the responsible person as a context packet: the ask, the urgency and the queries as evidence (references, re-run under their own scope). The user approves it first. Resolve the owner before calling.",
  input: createHandoffInputSchema,
  execute: async (input: z.infer<typeof createHandoffInputSchema>) => {
    const access = currentAccess();
    const target = recipient(input.toUserId);
    if (!target.ok) return { ok: false as const, error: target.error };
    const turn = currentTurn();
    const packet = await createPacket(
      {
        toUserId: target.user.id,
        title: input.title,
        ask: input.ask,
        urgency: input.urgency,
        evidence: mergeEvidence(input.evidence, turn.queries),
        alertIds: input.alertIds,
        digest: digestOfThread(turn.threadId),
        suggestedActions: suggestedActionsFor(input.ask),
        threadId: turn.threadId,
      },
      findUser(access.userId),
      target.user,
    );
    return {
      ok: true as const,
      summary: `ส่งงานให้ ${target.user.nameTh} แล้ว`,
      data: { packetId: packet.id, toUserId: target.user.id, toNameTh: target.user.nameTh, urgency: packet.urgency, sla: packet.sla, evidenceCount: packet.evidence.length },
    };
  },
});
