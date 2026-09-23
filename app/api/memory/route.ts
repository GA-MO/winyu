import { requireAccess, unauthenticated } from "../_guard";
import { memoryFacts } from "@/lib/server/agent/collections";
import { forgetAll, pruneMemory } from "@/lib/engine/memory";

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
  return Response.json({ forgotten: forgetAll(access.userId) });
}
