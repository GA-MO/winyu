import { cookies } from "next/headers";
import { serveChat } from "@/lib/harness/adapters/vexa/agent";
import { handlerFor } from "@/lib/server/agent/handler";
import { readAccess } from "@/lib/server/session";

const UNAUTHENTICATED = { error: "กรุณาเข้าสู่ระบบก่อน" };

export const maxDuration = 60;

export async function GET() {
  const access = readAccess(await cookies());
  if (!access) return Response.json(UNAUTHENTICATED, { status: 401 });
  return handlerFor(access).GET();
}

export async function POST(req: Request) {
  const access = readAccess(await cookies());
  if (!access) return Response.json(UNAUTHENTICATED, { status: 401 });
  return serveChat(access, req, handlerFor);
}
