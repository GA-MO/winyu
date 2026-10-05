import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";
import { runAnomalyJob, runEngineJobs, runForecastJob } from "@/lib/server/alerts";
import { runWatchJob } from "@/lib/server/watches";
import { runDigestJob } from "@/lib/server/digest";
import { tick } from "@/lib/server/scheduler";
import { runInvestigateJob } from "@/lib/server/investigate";
import { findUser } from "@/lib/data/entities/users";

type JobBody = { job?: unknown; user?: unknown };

const FORBIDDEN = { error: "เฉพาะผู้ดูแลระบบเท่านั้นที่สั่งรันงานเบื้องหลังได้" };

export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  if (access.role !== "it_admin") return Response.json(FORBIDDEN, { status: 403 });
  const body = await readBody<JobBody>(req);
  const job = body?.job ?? "all";
  if (job === "anomaly") return Response.json(runAnomalyJob());
  if (job === "forecast") return Response.json(runForecastJob());
  if (job === "watches") return Response.json(await runWatchJob());
  if (job === "digest") return Response.json(await runDigestJob());
  if (job === "tick") return Response.json({ ran: await tick() });
  if (job === "investigate") {
    const user = typeof body?.user === "string" ? findUser(body.user) : null;
    if (!user) return badRequest();
    return Response.json({ saved: await runInvestigateJob([user.id]) });
  }
  if (job === "all" || job === "compose") return Response.json(runEngineJobs());
  return badRequest();
}
