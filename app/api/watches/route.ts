import { requireAccess, unauthenticated } from "../_guard";
import type { WatchItem } from "@/lib/contracts";
import { conditionLabel, watchesOf } from "@/lib/server/watches";

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const watches: WatchItem[] = watchesOf(access.userId).map((watch) => ({
    id: watch.id,
    title: watch.title,
    condition: conditionLabel(watch.query, watch.condition),
    state: watch.state,
  }));
  return Response.json({ watches });
}
