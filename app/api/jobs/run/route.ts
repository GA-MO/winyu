import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";
import { runAnomalyJob, runEngineJobs, runForecastJob } from "@/lib/server/alerts";

type JobBody = { job?: unknown };

const FORBIDDEN = { error: "เฉพาะผู้ดูแลระบบเท่านั้นที่สั่งรันงานเบื้องหลังได้" };

export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  if (access.role !== "it_admin") return Response.json(FORBIDDEN, { status: 403 });
  const body = await readBody<JobBody>(req);
  const job = body?.job ?? "all";
  if (job === "anomaly") return Response.json(runAnomalyJob());
  if (job === "forecast") return Response.json(runForecastJob());
  if (job === "all" || job === "compose") return Response.json(runEngineJobs());
  return badRequest();
}
