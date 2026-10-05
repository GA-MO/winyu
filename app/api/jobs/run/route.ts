import { badRequest, readBody, requireAccess, unauthenticated } from "../../_guard";
import { runAnomalyJob, runEngineJobs, runForecastJob } from "@/lib/server/alerts";
import { runWatchJob } from "@/lib/server/watches";
import { runDigestJob } from "@/lib/server/digest";
import { investigationProgress, startInvestigation } from "@/lib/harness/adapters/mastra/jobs";
import { findUser } from "@/lib/data/entities/users";

type JobBody = { job?: unknown; user?: unknown };

const FORBIDDEN = { error: "เฉพาะผู้ดูแลระบบเท่านั้นที่สั่งรันงานเบื้องหลังได้" };
const NO_RUN = { error: "ไม่พบงานนี้" };
const STARTED = 202;

async function itAdmin(): Promise<Response | null> {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return access.role === "it_admin" ? null : Response.json(FORBIDDEN, { status: 403 });
}

export async function POST(req: Request) {
  const refused = await itAdmin();
  if (refused) return refused;
  const body = await readBody<JobBody>(req);
  const job = body?.job ?? "all";
  if (job === "anomaly") return Response.json(runAnomalyJob());
  if (job === "forecast") return Response.json(runForecastJob());
  if (job === "watches") return Response.json(await runWatchJob());
  if (job === "digest") return Response.json(await runDigestJob());
  if (job === "investigate") {
    const user = typeof body?.user === "string" ? findUser(body.user) : null;
    if (!user) return badRequest();
    return Response.json({ runId: await startInvestigation([user.id]) }, { status: STARTED });
  }
  if (job === "all" || job === "compose") return Response.json(runEngineJobs());
  return badRequest();
}

/** How far a started investigation has got: `?run=<runId>`. */
export async function GET(req: Request) {
  const refused = await itAdmin();
  if (refused) return refused;
  const runId = new URL(req.url).searchParams.get("run");
  if (!runId) return badRequest();
  const progress = await investigationProgress(runId);
  return progress ? Response.json(progress) : Response.json(NO_RUN, { status: 404 });
}
