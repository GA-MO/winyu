import { cookies } from "next/headers";
import { serveCopilot } from "@/lib/harness/adapters/mastra/serve";
import { readAccess } from "@/lib/server/session";

const UNAUTHENTICATED = { error: "กรุณาเข้าสู่ระบบก่อน" };

export const runtime = "nodejs";
export const maxDuration = 60;

async function serve(req: Request): Promise<Response> {
  const access = readAccess(await cookies());
  if (!access) return Response.json(UNAUTHENTICATED, { status: 401 });
  return serveCopilot(access, req);
}

export const GET = serve;
export const POST = serve;
