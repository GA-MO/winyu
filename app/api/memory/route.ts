import { requireAccess, unauthenticated } from "../_guard";
import { memoryFacts } from "@/lib/server/agent/collections";

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const facts = memoryFacts()
    .where((fact) => fact.userId === access.userId)
    .sort((left, right) => right.confidence - left.confidence);
  return Response.json({ facts });
}
