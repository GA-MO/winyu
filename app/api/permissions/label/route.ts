import { badRequest, notFound, requireAccess, unauthenticated } from "../../_guard";
import { METRIC_IDS, type MetricId } from "@/lib/contracts";
import { connectorFields, surfaceEntry } from "@/lib/server/tools/registry";
import { metricLabel } from "@/lib/dashboard/metric-display";

const ADMIN_ROLE = "it_admin";

function labelOf(kind: string, key: string): string | null {
  if (kind === "metric") return METRIC_IDS.includes(key as MetricId) ? metricLabel(key as MetricId) : null;
  if (kind === "tool") return surfaceEntry(key)?.labelTh ?? null;
  if (kind === "field") return connectorFields().find((field) => field.key === key)?.labelTh ?? null;
  return null;
}

/** The Thai name of what a permission change touches, for the card that asks the admin to approve it. */
export async function GET(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  if (access.role !== ADMIN_ROLE) return notFound();
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  const key = params.get("key");
  if (!kind || !key) return badRequest();
  const label = labelOf(kind, key);
  return label ? Response.json({ kind, key, label }) : notFound();
}
