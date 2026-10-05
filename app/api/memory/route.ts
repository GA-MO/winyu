import { requireAccess, unauthenticated } from "../_guard";
import { memoryFacts } from "@/lib/server/agent/collections";
import { forgetAll, pruneMemory } from "@/lib/engine/memory";
import { forgetConversations } from "@/lib/harness/adapters/mastra/recall";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  pruneMemory(access.userId);
  const facts = memoryFacts()
    .where((fact) => fact.userId === access.userId)
    .sort((left, right) => right.confidence - left.confidence);
  return Response.json({ facts });
}

export async function DELETE() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const forgotten = forgetAll(access.userId);
  await forgetConversations(access.userId);
  return Response.json({ forgotten });
}
